class MapGestureFixture {
  void pointer(String type, {bool map = true}) {}
  bool touch(
    String type,
    int pointer, {
    num x = 0,
    num y = 0,
    bool map = true,
  }) => true;
  Future<void> nextFrame() async {}
  void installFakeNativeMap() {}
  void createFakeNativeMap() {}
  List<double> fakeCameraUpdates() => [];
  void wheel() {}
  void dispose() {}
}
