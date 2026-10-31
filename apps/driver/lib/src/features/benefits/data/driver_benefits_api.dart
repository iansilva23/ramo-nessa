import '../domain/driver_benefits_models.dart';

abstract interface class DriverBenefitsApi {
  Future<DriverBenefitsSnapshot> benefits();
}
