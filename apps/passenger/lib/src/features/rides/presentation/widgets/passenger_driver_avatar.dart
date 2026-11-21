import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../data/passenger_driver_photo_source.dart';

class PassengerDriverAvatar extends StatefulWidget {
  const PassengerDriverAvatar({
    super.key,
    required this.source,
    required this.rideId,
    required this.driverId,
    required this.radius,
    required this.iconSize,
    this.backgroundColor,
    this.foregroundColor,
  });

  final Object? source;
  final String rideId;
  final String? driverId;
  final double radius;
  final double iconSize;
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  State<PassengerDriverAvatar> createState() => _PassengerDriverAvatarState();
}

class _PassengerDriverAvatarState extends State<PassengerDriverAvatar> {
  Future<Uint8List?>? _photo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(PassengerDriverAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rideId != widget.rideId ||
        oldWidget.driverId != widget.driverId ||
        !identical(oldWidget.source, widget.source)) {
      _load();
    }
  }

  void _load() {
    final source = widget.source;
    final driverId = widget.driverId;
    _photo = source is PassengerDriverPhotoSource && driverId != null
        ? source.driverPortrait(widget.rideId, driverId)
        : null;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List?>(
      future: _photo,
      builder: (context, snapshot) {
        final photo = snapshot.connectionState == ConnectionState.done
            ? snapshot.data
            : null;
        return CircleAvatar(
          radius: widget.radius,
          backgroundColor: widget.backgroundColor,
          foregroundColor: widget.foregroundColor,
          foregroundImage: photo == null ? null : MemoryImage(photo),
          onForegroundImageError: photo == null ? null : (_, _) {},
          child: Icon(Icons.person_rounded, size: widget.iconSize),
        );
      },
    );
  }
}
