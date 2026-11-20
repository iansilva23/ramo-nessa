import 'package:image_picker/image_picker.dart';

import 'driver_verification_photo.dart';

Future<PreparedDriverPhoto?> pickDriverPhoto(
  DriverVerificationPhoto field, {
  required bool camera,
}) async {
  final file = await ImagePicker().pickImage(
    source: camera ? ImageSource.camera : ImageSource.gallery,
    preferredCameraDevice: field == DriverVerificationPhoto.portrait
        ? CameraDevice.front
        : CameraDevice.rear,
    requestFullMetadata: false,
  );
  if (file == null) return null;
  if (await file.length() > 12 * 1024 * 1024) {
    throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
  }
  return prepareDriverVerificationPhoto(field, await file.readAsBytes());
}
