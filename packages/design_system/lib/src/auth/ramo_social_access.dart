import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';

import 'ramo_social_sdk_stub.dart'
    if (dart.library.js_interop) 'ramo_social_sdk_web.dart';

enum RamoSocialProvider {
  google('Google');

  const RamoSocialProvider(this.label);
  final String label;
}

class RamoSocialResult {
  const RamoSocialResult(this.data);
  final Map<String, dynamic> data;
  String? get next => data['next'] as String?;
  String? get fullName => data['fullName'] as String?;
  String? get email => data['email'] as String?;
}

class RamoSocialAccess {
  RamoSocialAccess({
    required this.baseUri,
    required this.driver,
    required this.clientFactory,
  });

  final Uri baseUri;
  final bool driver;
  final http.Client Function() clientFactory;

  static const _google = bool.fromEnvironment('RAMO_SOCIAL_GOOGLE_ENABLED');
  static const _nativeIos = bool.fromEnvironment(
    'RAMO_SOCIAL_NATIVE_IOS_ENABLED',
  );
  static const _apiKey = String.fromEnvironment('RAMO_FIREBASE_API_KEY');
  static const _appId = String.fromEnvironment('RAMO_FIREBASE_APP_ID');
  static const _project = String.fromEnvironment('RAMO_FIREBASE_PROJECT_ID');
  static const _sender = String.fromEnvironment(
    'RAMO_FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _authDomain = String.fromEnvironment(
    'RAMO_FIREBASE_AUTH_DOMAIN',
  );
  static const _googleServerId = String.fromEnvironment(
    'RAMO_GOOGLE_SERVER_CLIENT_ID',
  );
  static const _googleIosId = String.fromEnvironment(
    'RAMO_GOOGLE_IOS_CLIENT_ID',
  );
  static Future<void>? _googleInitialization;
  String? _token;
  String? _providerEmail;
  String? _providerName;

  List<RamoSocialProvider> get providers {
    if (_apiKey.isEmpty ||
        _appId.isEmpty ||
        _project.isEmpty ||
        _sender.isEmpty) {
      return const [];
    }
    final mobile =
        defaultTargetPlatform == TargetPlatform.android ||
        (_nativeIos && defaultTargetPlatform == TargetPlatform.iOS);
    return [
      if (_google &&
          (kIsWeb ||
              (mobile &&
                  _googleServerId.isNotEmpty &&
                  (defaultTargetPlatform != TargetPlatform.iOS ||
                      _googleIosId.isNotEmpty))))
        RamoSocialProvider.google,
    ];
  }

  bool get hasPendingGoogleRedirect =>
      providers.contains(RamoSocialProvider.google) &&
      ramoGoogleRedirectPending();

  Future<FirebaseAuth> _firebaseAuth({required bool redirect}) async {
    await prepareRamoSocialSdk();
    final name = redirect
        ? 'ramo-social-pwa-${driver ? 'driver' : 'passenger'}'
        : 'ramo-social';
    final options = FirebaseOptions(
      apiKey: _apiKey,
      appId: _appId,
      messagingSenderId: _sender,
      projectId: _project,
      authDomain: redirect
          ? Uri.base.host
          : (_authDomain.isEmpty ? '$_project.firebaseapp.com' : _authDomain),
    );
    final firebase =
        Firebase.apps.where((app) => app.name == name).firstOrNull ??
        await Firebase.initializeApp(name: name, options: options);
    return FirebaseAuth.instanceFor(app: firebase);
  }

  Future<RamoSocialResult?> resumeGoogleRedirect() async {
    if (!hasPendingGoogleRedirect) return null;
    ramoSetGoogleRedirectPending(false);
    final auth = await _firebaseAuth(redirect: true)
        .timeout(const Duration(seconds: 20));
    try {
      final credential = await auth.getRedirectResult().timeout(
        const Duration(seconds: 20),
      );
      if (credential.user == null) return null;
      return await _acceptGoogle(credential);
    } on FirebaseAuthException catch (e) {
      throw _googleError(e);
    } finally {
      if (auth.currentUser != null) await auth.signOut();
    }
  }

  Future<RamoSocialResult?> start(RamoSocialProvider provider) async {
    if (!providers.contains(provider)) {
      throw const FormatException('Esta opção de entrada está indisponível.');
    }
    clear();
    FirebaseAuth? session;
    var redirect = false;
    try {
      redirect = ramoGoogleUsesRedirect();
      final auth = session = await _firebaseAuth(redirect: redirect);
      final UserCredential result;
      if (kIsWeb) {
        final oauth = GoogleAuthProvider()
          ..setCustomParameters({'prompt': 'select_account'});
        if (redirect) {
          await auth.setPersistence(Persistence.SESSION);
          ramoSetGoogleRedirectPending(true);
          try {
            await auth
                .signInWithRedirect(oauth)
                .timeout(const Duration(seconds: 25));
          } on TimeoutException {
            // The authentication page can remain open in the PWA's in-app browser.
            throw const FormatException(
              'O Google ainda está aguardando. Conclua o login ou tente novamente.',
            );
          } catch (_) {
            ramoSetGoogleRedirectPending(false);
            rethrow;
          }
          return null;
        }
        await auth.setPersistence(Persistence.NONE);
        result = await auth.signInWithPopup(oauth);
      } else {
        final google = GoogleSignIn.instance;
        _googleInitialization ??= google.initialize(
          serverClientId: _googleServerId,
          clientId: defaultTargetPlatform == TargetPlatform.iOS
              ? _googleIosId
              : null,
        );
        await _googleInitialization;
        final account = await google.authenticate();
        final token = account.authentication.idToken;
        if (token == null)
          throw const FormatException('O Google não confirmou sua conta.');
        result = await auth.signInWithCredential(
          GoogleAuthProvider.credential(idToken: token),
        );
      }
      return await _acceptGoogle(result);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      throw FormatException(
        'Não foi possível conectar ao Google. Tente novamente.',
      );
    } on FirebaseAuthException catch (e) {
      if ([
        'popup-closed-by-user',
        'web-context-canceled',
        'cancelled-popup-request',
      ].contains(e.code))
        return null;
      throw _googleError(e);
    } finally {
      if (!redirect && session?.currentUser != null) await session!.signOut();
    }
  }

  Future<RamoSocialResult> _acceptGoogle(UserCredential result) async {
    _token = await result.user?.getIdToken();
    _providerName = result.user?.displayName;
    _providerEmail = result.user?.email;
    return _exchange('start');
  }

  FormatException _googleError(FirebaseAuthException error) =>
      switch (error.code) {
        'account-exists-with-different-credential' => const FormatException(
          'Entre pelo provedor que já usa nesta conta ou use seu acesso do Ramo Nessa.',
        ),
        'popup-blocked' => const FormatException(
          'Permita a abertura da janela do Google e tente novamente.',
        ),
        _ => const FormatException(
          'Não foi possível conectar ao Google. Tente novamente.',
        ),
      };

  Future<RamoSocialResult> register(String fullName, String phone) =>
      _exchange('register', {'fullName': fullName, 'phone': phone});

  Future<RamoSocialResult> link(String identifier, String password) =>
      _exchange('link', {'identifier': identifier, 'password': password});

  void clear() {
    _token = null;
    _providerEmail = null;
    _providerName = null;
  }

  Future<RamoSocialResult> _exchange(
    String action, [
    Map<String, String> data = const {},
  ]) async {
    final token = _token;
    if (token == null)
      throw const FormatException('Confirme sua conta Google novamente.');
    final role = driver ? 'driver' : 'passenger';
    final client = clientFactory();
    try {
      final response = await client
          .post(
            baseUri.resolve('/v1/auth/$role/social/$action'),
            headers: {
              'content-type': 'application/json',
              if (kIsWeb) 'x-ramo-web-role': role,
            },
            body: jsonEncode({'token': token, ...data}),
          )
          .timeout(const Duration(seconds: 15));
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map<String, dynamic>)
        throw const FormatException('Resposta inválida. Tente novamente.');
      if (response.statusCode != 200) {
        throw FormatException(
          decoded['message'] as String? ??
              'Não foi possível entrar. Tente novamente.',
        );
      }
      if (decoded['next'] is String) {
        return RamoSocialResult({
          'fullName': _providerName,
          'email': _providerEmail,
          ...decoded,
        });
      }
      final accessToken = decoded['accessToken'];
      if (decoded['subjectType'] != role ||
          accessToken is! String ||
          (kIsWeb &&
              !RegExp('^ramo_web_${role}_v1_[a-f0-9]{32}\$')
                  .hasMatch(accessToken))) {
        throw const FormatException('Sessão inválida. Tente novamente.');
      }
      clear();
      return RamoSocialResult(decoded);
    } finally {
      client.close();
    }
  }
}
