import XCTest
import UIKit

final class ColdAudit: XCTestCase {
  let base = URL(string: "https://localhost:9443")!
  override func setUpWithError() throws { continueAfterFailure = false }
  func note(_ name: String) {
    let done = expectation(description: "phase")
    URLSession.shared.dataTask(with: base.appendingPathComponent("audit/phase/" + name)) { _,_,_ in done.fulfill() }.resume()
    wait(for: [done], timeout: 10)
  }
  func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
  func dump(_ app: XCUIApplication, _ name: String) {
    let a = XCTAttachment(string: app.debugDescription); a.name = name; a.lifetime = .keepAlways; add(a)
  }
  func paintedAvatar(in app: XCUIApplication) -> CGPoint? {
    let screenshot = XCUIScreen.main.screenshot().image
    let image = screenshot.cgImage!
    let width = image.width, height = image.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let result = pixels.withUnsafeMutableBytes { raw -> CGPoint? in
      guard let context = CGContext(data: raw.baseAddress, width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      let bytes = raw.bindMemory(to: UInt8.self)
      let scale = CGFloat(width) / app.frame.width
      var start: Int? = nil
      for y in Int(50 * scale)..<min(height, Int(260 * scale)) {
        var count = 0
        for x in Int(18 * scale)..<min(width, Int(70 * scale)) {
          let i = (y * width + x) * 4
          if bytes[i] > 230 && bytes[i+1] > 230 && bytes[i+2] > 230 { count += 1 }
        }
        if count >= Int(12 * scale) {
          if start == nil { start = y }
        } else if let begin = start {
          if y - begin >= Int(28 * scale) && y - begin <= Int(60 * scale) {
            return CGPoint(x: 44, y: CGFloat(begin + y - 1) / 2 / scale)
          }
          start = nil
        }
      }
      return nil
    }
    return result
  }
  func tapPaintedAvatar(_ app: XCUIApplication, _ phase: String) throws {
    // Cold CanvasKit startup on a fresh simulator can exceed eight seconds.
    // Wait using screenshots only: do not activate semantics or touch the web app.
    var paintedPoint: CGPoint?
    for _ in 0..<60 {
      paintedPoint = paintedAvatar(in: app)
      if paintedPoint != nil { break }
      Thread.sleep(forTimeInterval: 1)
    }
    guard let point = paintedPoint else {
      capture("avatar-detection-failed")
      throw NSError(domain: "Audit", code: 1, userInfo: [NSLocalizedDescriptionKey: "No painted avatar circle appeared within 60 seconds; no guessed tap performed"])
    }
    note(phase + "-before"); capture(phase + "-before-first-touch")
    let beforeImage = XCUIScreen.main.screenshot().image.pngData()!
    let a = XCTAttachment(string: "Paint-derived target in screen points: \(point); appFrame=\(app.frame); screenshotSize=\(XCUIScreen.main.screenshot().image.size)"); a.lifetime = .keepAlways; add(a)
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY)).tap()
    Thread.sleep(forTimeInterval: 1)
    note(phase + "-after"); capture(phase + "-after-first-touch")
    let afterImage = XCUIScreen.main.screenshot().image.pngData()!
    XCTAssertNotEqual(beforeImage, afterImage, "First touch left the screen unchanged; inspect profile evidence")
  }
  func tapNativeCenter(_ element: XCUIElement, in app: XCUIApplication, name: String) throws {
    let ready = NSPredicate(format: "hittable == true")
    let readiness = XCTNSPredicateExpectation(predicate: ready, object: element)
    let readinessResult = XCTWaiter.wait(for: [readiness], timeout: 8)
    if readinessResult != .completed && !name.hasPrefix("more-") {
      capture(name + "-not-ready"); dump(app, name + "-not-ready-tree")
      throw NSError(domain: "Audit", code: 3, userInfo: [NSLocalizedDescriptionKey: "Native control never became hittable; no blind tap"] )
    }
    let frame = element.frame
    let a = XCTAttachment(string: "Native element \(name): \(frame), app frame \(app.frame), hittable \(element.isHittable)")
    a.name = name + "-frame"; a.lifetime = .keepAlways; add(a)
    guard frame.width > 0 && frame.height > 0 && frame.midX >= 0 && frame.midY >= 0 else {
      dump(app, name + "-invalid-frame"); capture(name + "-invalid-frame")
      throw NSError(domain: "Audit", code: 2, userInfo: [NSLocalizedDescriptionKey: "No valid native element frame; no guessed tap"])
    }
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.midX-app.frame.minX, dy: frame.midY-app.frame.minY)).tap()
    Thread.sleep(forTimeInterval: 1)
  }
  func dismissSafariTip(_ safari: XCUIApplication) throws {
    let tip = safari.staticTexts["View Bookmarks, Share Menu, and Open Tabs"].firstMatch
    if tip.exists {
      let close = safari.buttons["xmark.circle.fill"].firstMatch
      XCTAssertTrue(close.exists, "Observed Safari first-use tip has no close control")
      capture("safari-tip-before-dismiss")
      try tapNativeCenter(close, in: safari, name: "safari-tip-close")
    }
  }
  func testActualHomeScreenLaunch() throws {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate(); Thread.sleep(forTimeInterval: 8)
    for label in ["Continue", "Start Using Safari", "Not Now"] {
      let b = safari.buttons[label].firstMatch
      if b.exists && b.isHittable { b.tap(); Thread.sleep(forTimeInterval: 1) }
    }
    capture("safari-cold")
    // Continue at the failed native installation step; do not repeat the Safari touch trial.
    dump(safari, "safari-before-native-menu")
    try dismissSafariTip(safari)
    let share = safari.buttons.matching(NSPredicate(format: "label == %@ OR label == %@ OR label == %@", "Share", "Share…", "Share...")).firstMatch
    for attempt in 0..<3 {
      if share.exists && share.isHittable { break }
      try dismissSafariTip(safari)
      let more = safari.buttons["More"].firstMatch
      if more.waitForExistence(timeout: 3) { try tapNativeCenter(more, in: safari, name: "more-" + String(attempt)) }
      else {
        let menu = safari.buttons["Page Menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 3), "Native Safari menu not found")
        try tapNativeCenter(menu, in: safari, name: "page-menu")
      }
      if share.waitForExistence(timeout: 5) { break }
      capture("native-menu-retry-" + String(attempt))
    }
    capture("after-native-menu"); dump(safari, "after-native-menu-tree")
    XCTAssertTrue(share.waitForExistence(timeout: 5), "Share action not found")
    share.tap(); Thread.sleep(forTimeInterval: 1)
    var addHome = safari.cells["Add to Home Screen"].firstMatch
    for _ in 0..<5 {
      if addHome.exists && addHome.isHittable { break }
      safari.swipeUp(); Thread.sleep(forTimeInterval: 0.5)
      addHome = safari.cells["Add to Home Screen"].firstMatch
    }
    dump(safari, "native-share-tree"); capture("native-share")
    XCTAssertTrue(addHome.exists && addHome.isHittable, "Add to Home Screen action not found")
    try tapNativeCenter(addHome, in: safari, name: "add-home-cell"); Thread.sleep(forTimeInterval: 1)
    let field = safari.textFields.firstMatch
    if field.exists {
      field.tap()
      let old = field.value as? String ?? ""
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count))
      field.typeText("Ramo Audit")
    }
    capture("native-install-confirmation")
    let add = safari.buttons["Add"].firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
    safari.terminate()
    XCUIDevice.shared.press(.home)
    let board = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    board.activate()
    Thread.sleep(forTimeInterval: 2)
    var visibleIcon: XCUIElement?
    for page in 0..<5 {
      visibleIcon = board.icons.matching(identifier: "Ramo Audit").allElementsBoundByIndex.first {
        $0.exists && $0.isHittable && $0.frame.width > 0 && $0.frame.height > 0
      }
      if visibleIcon != nil { break }
      capture("home-page-" + String(page))
      board.swipeLeft()
      Thread.sleep(forTimeInterval: 1)
    }
    guard let icon = visibleIcon else {
      capture("installed-icon-not-visible")
      dump(board, "installed-icon-tree")
      XCTFail("Installed icon has no visible tappable frame on inspected Home Screen pages")
      return
    }
    icon.tap(); Thread.sleep(forTimeInterval: 8)
    note("standalone-cold"); capture("standalone-host-launched-before-any-web-touch")
    let app = XCUIApplication(bundleIdentifier: "com.apple.webapp")
    if app.state == .runningForeground {
      try tapPaintedAvatar(app, "standalone")
    } else {
      dump(board, "standalone-host-identification")
      XCTFail("PWA launched; its foreground bundle must be identified before coordinate tapping")
    }
  }
}
