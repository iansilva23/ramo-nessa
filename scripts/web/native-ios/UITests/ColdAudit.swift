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
  func paintedAvatar(in app: XCUIApplication) throws -> CGPoint {
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
    guard let point = result else { capture("avatar-detection-failed"); throw NSError(domain: "Audit", code: 1, userInfo: [NSLocalizedDescriptionKey: "No painted avatar circle found; no guessed tap performed"]) }
    return point
  }
  func tapPaintedAvatar(_ app: XCUIApplication, _ phase: String) throws {
    note(phase + "-before"); capture(phase + "-before-first-touch")
    let point = try paintedAvatar(in: app)
    let a = XCTAttachment(string: "Paint-derived target in screen points: \(point); appFrame=\(app.frame); screenshotSize=\(XCUIScreen.main.screenshot().image.size)"); a.lifetime = .keepAlways; add(a)
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY)).tap()
    Thread.sleep(forTimeInterval: 1)
    note(phase + "-after"); capture(phase + "-after-first-touch")
  }
  func tapNativeCenter(_ element: XCUIElement, in app: XCUIApplication, name: String) throws {
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
    let share = safari.buttons["Share"].firstMatch
    if !share.exists || !share.isHittable {
      let more = safari.buttons["More"].firstMatch
      if more.waitForExistence(timeout: 3) { try tapNativeCenter(more, in: safari, name: "more") }
      else {
        let menu = safari.buttons["Page Menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 3), "Native Safari menu not found")
        try tapNativeCenter(menu, in: safari, name: "page-menu")
      }
    }
    capture("after-native-menu"); dump(safari, "after-native-menu-tree")
    XCTAssertTrue(share.waitForExistence(timeout: 5), "Share action not found")
    share.tap(); Thread.sleep(forTimeInterval: 1)
    var addHome = safari.buttons["Add to Home Screen"].firstMatch
    for _ in 0..<5 {
      if addHome.exists && addHome.isHittable { break }
      safari.swipeUp(); Thread.sleep(forTimeInterval: 0.5)
      addHome = safari.buttons["Add to Home Screen"].firstMatch
    }
    dump(safari, "native-share-tree"); capture("native-share")
    XCTAssertTrue(addHome.exists && addHome.isHittable, "Add to Home Screen action not found")
    addHome.tap(); Thread.sleep(forTimeInterval: 1)
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
    XCUIDevice.shared.press(.home)
    let board = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let icon = board.icons["Ramo Audit"].firstMatch
    XCTAssertTrue(icon.waitForExistence(timeout: 10), "Installed icon not found")
    safari.terminate(); icon.tap(); Thread.sleep(forTimeInterval: 8)
    note("standalone-cold"); capture("standalone-cold-before-any-web-touch")
    let app = XCUIApplication(bundleIdentifier: "com.apple.webapp")
    if app.state == .runningForeground {
      try tapPaintedAvatar(app, "standalone")
    } else {
      dump(board, "standalone-host-identification")
      XCTFail("PWA launched; its foreground bundle must be identified before coordinate tapping")
    }
  }
}
