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

class _MobileAuthGateState extends State<MobileAuthGate> with WidgetsBindingObserver {
  bool _refreshing = false;
  bool _loggingOut = false;
  String? _accessToken;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _accessToken = widget.initialAccessToken?.trim();
    Future<void>.microtask(_bootstrap);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_checking && !_refreshing) unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_refreshing || _loggingOut) return;
    _refreshing = true;
    final token = _accessToken;
    if (token == null || token.length < 20) {
      if (!mounted) return;
      _refreshing = false;
      setState(() => _checking = false);
      return;
    }

    try {
      final session = await widget.service.currentSession(token);
      if (!mounted || _accessToken != token || _loggingOut) { _refreshing = false; return; }
      if (
        session == null ||
        session.subjectType != widget.subjectType ||
        session.expiresAt.isBefore(DateTime.now())
      ) {
        try {
          await widget.tokenStore.clearAccessToken();
        } catch (_) {}
        if (!mounted || _accessToken != token) { _refreshing = false; return; }
        _accessToken = null;
        _notifySessionEnded();
      }
    } catch (_) {
      // Falha de rede/Core não remove uma sessão que ainda pode ser válida.
      // As chamadas protegidas continuarão dependendo da validação do servidor.
    }

    final readyToken = _accessToken;
    if (readyToken != null && readyToken.length >= 20) {
      final callback = widget.onSessionReady;
      if (callback != null) {
        unawaited(Future<void>.sync(() => callback(readyToken)).catchError((_) {}));
      }
    }

    _refreshing = false;
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
      unawaited(Future<void>.sync(() => callback(token)).catchError((_) {}));
    }
  }

  void _notifySessionEnded() {
    final ended = widget.onSessionEnded;
    if (ended != null) {
      // Push cleanup is best-effort; a stalled provider must not retain the UI.
      unawaited(Future<void>.sync(ended).catchError((_) {}));
    }
  }

  Future<bool> _logout() async {
    final token = _accessToken;
    if (_loggingOut || token == null || token.length < 20) return false;
    _loggingOut = true;

    try {
      try {
        await widget.service.logout(token);
      } catch (_) {
        // Keep the local session when the Core has not confirmed revocation.
        return false;
      }

      try {
        await widget.tokenStore.clearAccessToken();
      } catch (_) {
        // A residual token is already revoked and rejected at next bootstrap.
      }

      // Begin cleanup before exposing login, without waiting on push providers.
      _notifySessionEnded();
      if (!mounted) return true;
      setState(() {
        _accessToken = null;
        _checking = false;
      });
      return true;
    } finally {
      _loggingOut = false;
    }
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
