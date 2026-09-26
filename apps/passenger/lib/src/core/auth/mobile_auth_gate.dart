import 'dart:async';

import 'package:flutter/material.dart';

import 'auth_token_store.dart';
import 'phone_auth_service.dart';
import 'passenger_auth_screen.dart';

class MobileAuthGate extends StatefulWidget {
  const MobileAuthGate({
    super.key,
    required this.subjectType,
    required this.service,
    required this.tokenStore,
    required this.initialAccessToken,
    required this.devBypass,
    required this.loginTitle,
    required this.loginSubtitle,
    required this.authenticatedBuilder,
    this.onSessionReady,
    this.onSessionEnded,
  });

  final String subjectType;
  final PhoneAuthService service;
  final AuthTokenStore tokenStore;
  final String? initialAccessToken;
  final bool devBypass;
  final String loginTitle;
  final String loginSubtitle;
  final Widget Function(
    String? accessToken,
    Future<bool> Function() logout,
  ) authenticatedBuilder;
  final Future<void> Function(String accessToken)? onSessionReady;
  final Future<void> Function()? onSessionEnded;

  @override
  State<MobileAuthGate> createState() => _MobileAuthGateState();
}

class _MobileAuthGateState extends State<MobileAuthGate> {
  String? _accessToken;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    _accessToken = widget.initialAccessToken?.trim();
    Future<void>.microtask(_bootstrap);
  }

  Future<void> _bootstrap() async {
    final token = _accessToken;
    if (token == null || token.length < 20) {
      if (!mounted) return;
      setState(() => _checking = false);
      return;
    }

    try {
      final session = await widget.service.currentSession(token);
      if (
        session == null ||
        session.subjectType != widget.subjectType ||
        session.expiresAt.isBefore(DateTime.now())
      ) {
        try {
          await widget.tokenStore.clearAccessToken();
        } catch (_) {}
        _accessToken = null;
      }
    } catch (_) {
      // Falha de rede/Core não remove uma sessão que ainda pode ser válida.
      // As chamadas protegidas continuarão dependendo da validação do servidor.
    }

    final readyToken = _accessToken;
    if (readyToken != null && readyToken.length >= 20) {
      final callback = widget.onSessionReady;
      if (callback != null) {
        unawaited(callback(readyToken));
      }
    }

    if (!mounted) return;
    setState(() => _checking = false);
  }

  void _authenticated(String token) {
    setState(() {
      _accessToken = token;
      _checking = false;
    });
    final callback = widget.onSessionReady;
    if (callback != null) {
      unawaited(callback(token));
    }
  }

  Future<bool> _logout() async {
    final token = _accessToken;
    if (token == null || token.length < 20) {
      return false;
    }

    try {
      await widget.service.logout(token);
    } catch (_) {
      return false;
    }

    try {
      await widget.tokenStore.clearAccessToken();
    } catch (_) {
      // A sessão já foi revogada no Core. Um token local residual será
      // rejeitado no próximo bootstrap e não deve manter a UI autenticada.
    }

    final ended = widget.onSessionEnded;
    if (ended != null) {
      try {
        await ended();
      } catch (_) {
        // Logout do Core já foi concluído; push é best-effort.
      }
    }

    if (!mounted) return true;
    setState(() {
      _accessToken = null;
      _checking = false;
    });
    return true;
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final token = _accessToken;
    if ((token != null && token.length >= 20) || widget.devBypass) {
      return widget.authenticatedBuilder(token, _logout);
    }

    return PassengerAuthScreen(
      service: widget.service,
      tokenStore: widget.tokenStore,
      onAuthenticated: _authenticated,
    );
  }
}
