#!/usr/bin/env python3
"""Test one recovery channel through the live Ramo Nessa API."""

import getpass
import json
import re
import sys
import time
import urllib.error
import urllib.request
import warnings

BASE = 'https://app.ramonessa.com.br'
ROLES = {'passageiro': 'passenger', 'motorista': 'driver'}
CHANNELS = {'email': 'email', 'whatsapp': 'whatsapp'}


class TestError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def call(method, path, expected, body=None, token=None):
    headers = {'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers=headers,
    )
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=15) as response:
            if response.status != expected:
                raise TestError(f'{path} retornou HTTP {response.status}; esperado {expected}.')
            print(f'{method} {path} → HTTP {response.status}', flush=True)
            return None if expected == 204 else json.load(response)
    except urllib.error.HTTPError as error:
        with error:
            try:
                payload = json.loads(error.read(8192))
                reason = payload.get('error', '') if isinstance(payload, dict) else ''
            except ValueError:
                reason = ''
            code = f' ({reason})' if isinstance(reason, str) and re.fullmatch(r'[A-Z0-9_]{1,80}', reason) else ''
            retry = error.headers.get('Retry-After', '')
            wait = f' Aguarde {retry} segundos.' if retry.isdigit() else ''
            raise TestError(f'{path} retornou HTTP {error.code}{code}.{wait}') from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise TestError(f'Sem resposta conclusiva de {path}. Confira a etapa antes de repetir.') from None


def sign_in(role, access, password):
    field = 'email' if role == 'passenger' else 'identifier'
    result = call('POST', f'/v1/auth/{role}/password/login', 201, {field: access, 'password': password})
    token = result.get('accessToken') if isinstance(result, dict) else None
    if not isinstance(token, str) or len(token) < 20:
        raise TestError('O login não retornou uma sessão válida.')
    return token


def hidden(prompt):
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass(prompt)


def read_code(label):
    value = hidden(f'Cole o código de {label} recebido e pressione Enter: ').strip()
    if not re.fullmatch(r'[0-9]{6}', value):
        raise TestError('Esperava um código de seis dígitos. Nenhum código foi enviado à API para validação.')
    return value


def challenge(response):
    value = response.get('challengeId') if isinstance(response, dict) else None
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F-]{36}', value):
        raise TestError('A API não retornou um identificador válido para o teste.')
    return value


def choose_new_password():
    password = hidden('Nova senha da conta de teste: ')
    if not 10 <= len(password) <= 128 or not re.search(r'[A-Za-zÀ-ÿ]', password) or not re.search(r'[0-9]', password):
        raise TestError('Use de 10 a 128 caracteres, com pelo menos uma letra e um número.')
    if password != hidden('Repita a nova senha: '):
        raise TestError('As senhas digitadas estão diferentes.')
    return password


def require_ok(result, stage):
    if not isinstance(result, dict) or result.get('ok') is not True:
        raise TestError(f'A API não confirmou {stage}.')


def main():
    print('Teste real de recuperação de senha no Ramo Nessa.')
    role = ROLES.get(input('Perfil [passageiro/motorista]: ').strip().lower())
    channel = CHANNELS.get(input('Canal [email/whatsapp]: ').strip().lower())
    if role is None or channel is None:
        raise TestError('Perfil ou canal inválido.')
    access = input('E-mail da conta de teste (motorista pode usar o nome de usuário): ').strip()
    if not 3 <= len(access) <= 254:
        raise TestError('Informe o acesso da sua conta de teste.')
    already_confirmed = input('Esse canal já foi confirmado em Contatos para recuperar senha? [s/N]: ').strip().lower() == 's'
    print('Use somente uma conta sua de teste. A redefinição altera a senha e revoga as sessões dessa conta.')
    print('Este teste pede um código real, ou dois se também precisar confirmar o contato.')
    if input('Digite TESTAR para continuar: ').strip() != 'TESTAR':
        raise TestError('Teste cancelado.')

    root = f'/v1/auth/{role}/recovery'
    config = call('GET', root + '/channels', 200)
    if not isinstance(config, dict) or channel not in config.get('channels', []):
        raise TestError('O canal selecionado não está habilitado na API.')
    if not already_confirmed:
        current = hidden('Senha atual da conta de teste: ')
        token = sign_in(role, access, current)
        started = time.monotonic()
        try:
            code_id = challenge(call('POST', root + '/confirm-request', 202,
                                     {'channel': channel, 'password': current}, token))
            print('Solicitação de confirmação aceita. Confira o contato cadastrado.')
            code = read_code('confirmação do contato')
            require_ok(call('POST', root + '/confirm-complete', 200,
                            {'challengeId': code_id, 'code': code}, token), 'a confirmação do contato')
            print('Contato confirmado.')
        finally:
            try:
                call('DELETE', '/v1/auth/session', 204, token=token)
            except TestError:
                print('A sessão de teste não foi encerrada neste passo. Uma redefinição concluída revoga as sessões.')
        remaining = 61 - (time.monotonic() - started)
        if remaining > 0:
            print(f'Aguardando {int(remaining) + 1}s para respeitar o intervalo de envio.', flush=True)
            time.sleep(remaining)

    code_id = challenge(call('POST', root + '/request', 202, {'channel': channel, 'identifier': access}))
    print('Solicitação de recuperação aceita. A chegada da mensagem só é confirmada com o código.')
    code = read_code('recuperação')
    password = choose_new_password()
    require_ok(call('POST', root + '/complete', 200, {
        'challengeId': code_id, 'code': code, 'password': password,
    }), 'a troca de senha')
    print('Nova senha gravada. Conferindo o login normal com ela.')
    token = sign_in(role, access, password)
    try:
        call('DELETE', '/v1/auth/session', 204, token=token)
    except TestError:
        print('Login validado. A sessão de teste não foi encerrada por este comando.')
    print(f'RECUPERACAO_TESTADA perfil={role} canal={channel}')


if __name__ == '__main__':
    try:
        main()
    except TestError as error:
        sys.exit(str(error))
    except (KeyboardInterrupt, EOFError, getpass.GetPassWarning):
        sys.exit('Teste interrompido. Confira a última etapa antes de tentar novamente.')
    except (ValueError, TypeError):
        sys.exit('A API retornou um formato inesperado. Confira a última etapa informada.')
