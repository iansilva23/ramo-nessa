import CoreMethods
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private static let paymentChannelName = "br.com.ramonessa.passenger/payments"

  private var paymentChannel: FlutterMethodChannel?
  private var pendingCardResult: FlutterResult?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FLTFirebaseMessagingPlugin.configureNotificationCenterDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let channel = FlutterMethodChannel(
      name: Self.paymentChannelName,
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    paymentChannel = channel

    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "tokenizeCard" else {
        result(FlutterMethodNotImplemented)
        return
      }
      self?.openCardTokenization(call: call, result: result)
    }
  }

  private func openCardTokenization(
    call: FlutterMethodCall,
    result: @escaping FlutterResult
  ) {
    guard pendingCardResult == nil else {
      result(
        FlutterError(
          code: "CARD_FLOW_ACTIVE",
          message: "Já existe um cartão sendo preenchido.",
          details: nil
        )
      )
      return
    }

    guard
      let arguments = call.arguments as? [String: Any],
      let amountNumber = arguments["amountCents"] as? NSNumber,
      amountNumber.intValue > 0
    else {
      result(
        FlutterError(
          code: "CARD_AMOUNT_INVALID",
          message: "Valor da corrida inválido para validar o cartão.",
          details: nil
        )
      )
      return
    }

    let publicKey = (arguments["publicKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !publicKey.isEmpty else {
      result(
        FlutterError(
          code: "MERCADO_PAGO_NOT_CONFIGURED",
          message: "Public Key do Mercado Pago não configurada neste build.",
          details: nil
        )
      )
      return
    }

    let configuration = MercadoPagoSDK.Configuration(
      publicKey: publicKey,
      country: .BRA
    )
    MercadoPagoSDK.shared.initialize(configuration)

    guard let presenter = topViewController(from: window?.rootViewController) else {
      result(
        FlutterError(
          code: "CARD_UI_UNAVAILABLE",
          message: "Não foi possível abrir o pagamento seguro.",
          details: nil
        )
      )
      return
    }

    pendingCardResult = result

    let controller = RamoCardTokenizationViewController(
      amountCents: amountNumber.intValue
    ) { [weak self] outcome in
      guard let self else { return }

      presenter.dismiss(animated: true) {
        let flutterResult = self.pendingCardResult
        self.pendingCardResult = nil

        guard let flutterResult else { return }

        switch outcome {
        case .success(let payload):
          flutterResult([
            "token": payload.token,
            "paymentMethodId": payload.paymentMethodId,
            "paymentMethodType": payload.paymentMethodType,
            "lastFourDigits": payload.lastFourDigits as Any,
          ])
        case .failure(let error):
          flutterResult(
            FlutterError(
              code: error.code,
              message: error.message,
              details: nil
            )
          )
        case .cancelled:
          flutterResult(
            FlutterError(
              code: "CARD_CANCELLED",
              message: "Cadastro do cartão cancelado.",
              details: nil
            )
          )
        }
      }
    }

    let navigation = UINavigationController(rootViewController: controller)
    navigation.modalPresentationStyle = .formSheet
    if #available(iOS 15.0, *) {
      navigation.sheetPresentationController?.detents = [.large()]
      navigation.sheetPresentationController?.prefersGrabberVisible = true
    }
    presenter.present(navigation, animated: true)
  }

  private func topViewController(from base: UIViewController?) -> UIViewController? {
    if let navigation = base as? UINavigationController {
      return topViewController(from: navigation.visibleViewController)
    }
    if let tab = base as? UITabBarController {
      return topViewController(from: tab.selectedViewController)
    }
    if let presented = base?.presentedViewController {
      return topViewController(from: presented)
    }
    return base
  }
}

private struct RamoCardTokenizationPayload {
  let token: String
  let paymentMethodId: String
  let paymentMethodType: String
  let lastFourDigits: String?
}

private struct RamoCardFlowError: Error {
  let code: String
  let message: String
}

private enum RamoCardFlowOutcome {
  case success(RamoCardTokenizationPayload)
  case failure(RamoCardFlowError)
  case cancelled
}

private final class RamoCardTokenizationViewController: UIViewController {
  private let amountCents: Int
  private let completion: (RamoCardFlowOutcome) -> Void
  private let coreMethods = CoreMethods()

  private let brandBlack = UIColor(red: 13 / 255, green: 13 / 255, blue: 13 / 255, alpha: 1)
  private let brandYellow = UIColor(red: 250 / 255, green: 213 / 255, blue: 14 / 255, alpha: 1)

  private var paymentMethodId: String?
  private var paymentMethodType: String?
  private var lastFourDigits: String?
  private var singlePaymentAvailable = false
  private var loadingMethod = false
  private var tokenizing = false
  private var paymentLookupGeneration = 0

  private lazy var holderField = makePlainField(
    placeholder: "Nome impresso no cartão",
    keyboard: .default
  )

  private lazy var cpfField = makePlainField(
    placeholder: "CPF do titular",
    keyboard: .numberPad
  )

  private lazy var cardNumberField: CardNumberTextField = {
    let field = CardNumberTextField()
    field.translatesAutoresizingMaskIntoConstraints = false
    field.setPlaceholder("Número do cartão")
    field.backgroundColor = .white
    field.layer.cornerRadius = 16
    field.clipsToBounds = true

    field.onBinChanged = { [weak self] bin in
      guard let self else { return }
      if bin.count >= 6 {
        self.loadPaymentMethod(bin: bin)
      } else {
        self.paymentLookupGeneration += 1
        self.paymentMethodId = nil
        self.paymentMethodType = nil
        self.singlePaymentAvailable = false
        self.loadingMethod = false
        self.statusLabel.text = "Informe os dados do cartão."
        self.updateSubmitState()
      }
    }

    field.onLastFourDigitsFilled = { [weak self] lastFour in
      self?.lastFourDigits = lastFour
      self?.updateSubmitState()
    }

    field.onLengthChanged = { [weak self] _ in
      self?.updateSubmitState()
    }

    field.onError = { [weak self] _ in
      self?.statusLabel.text = "Confira o número do cartão."
      self?.updateSubmitState()
    }

    return field
  }()

  private lazy var expirationField: ExpirationDateTextfield = {
    let field = ExpirationDateTextfield()
    field.translatesAutoresizingMaskIntoConstraints = false
    field.setPlaceholder("MM/AA")
    field.backgroundColor = .white
    field.layer.cornerRadius = 16
    field.clipsToBounds = true
    field.onInputFilled = { [weak self] in
      self?.updateSubmitState()
    }
    field.onLengthChanged = { [weak self] _ in
      self?.updateSubmitState()
    }
    field.onError = { [weak self] _ in
      self?.statusLabel.text = "Confira a validade do cartão."
      self?.updateSubmitState()
    }
    return field
  }()

  private lazy var securityField: SecurityCodeTextField = {
    let field = SecurityCodeTextField()
    field.translatesAutoresizingMaskIntoConstraints = false
    field.setPlaceholder("CVV")
    field.backgroundColor = .white
    field.layer.cornerRadius = 16
    field.clipsToBounds = true
    field.onInputFilled = { [weak self] in
      self?.updateSubmitState()
    }
    field.onLengthChanged = { [weak self] _ in
      self?.updateSubmitState()
    }
    field.onError = { [weak self] _ in
      self?.statusLabel.text = "Confira o código de segurança."
      self?.updateSubmitState()
    }
    return field
  }()

  private lazy var statusLabel: UILabel = {
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.textColor = UIColor(white: 0.78, alpha: 1)
    label.font = .systemFont(ofSize: 13)
    label.numberOfLines = 0
    label.textAlignment = .center
    label.text = "Informe os dados do cartão."
    return label
  }()

  private lazy var progress: UIActivityIndicatorView = {
    let view = UIActivityIndicatorView(style: .medium)
    view.translatesAutoresizingMaskIntoConstraints = false
    view.color = brandYellow
    view.hidesWhenStopped = true
    return view
  }()

  private lazy var submitButton: UIButton = {
    let button = UIButton(type: .system)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.setTitle("Continuar com segurança", for: .normal)
    button.setTitleColor(brandBlack, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
    button.backgroundColor = brandYellow
    button.layer.cornerRadius = 18
    button.addTarget(self, action: #selector(tokenize), for: .touchUpInside)
    return button
  }()

  init(
    amountCents: Int,
    completion: @escaping (RamoCardFlowOutcome) -> Void
  ) {
    self.amountCents = amountCents
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = brandBlack
    title = "Cartão protegido"

    navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: "Cancelar",
      style: .plain,
      target: self,
      action: #selector(cancel)
    )
    navigationController?.navigationBar.tintColor = brandYellow
    navigationController?.navigationBar.titleTextAttributes = [
      .foregroundColor: UIColor.white
    ]
    navigationController?.navigationBar.barTintColor = brandBlack

    buildLayout()

    holderField.addTarget(self, action: #selector(plainFieldChanged), for: .editingChanged)
    cpfField.addTarget(self, action: #selector(plainFieldChanged), for: .editingChanged)

    updateSubmitState()
  }

  private func buildLayout() {
    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.keyboardDismissMode = .interactive

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.spacing = 12

    let mark = UILabel()
    mark.text = "●  RAMO NESSA"
    mark.textColor = brandYellow
    mark.font = .systemFont(ofSize: 21, weight: .black)
    mark.textAlignment = .center

    let headline = UILabel()
    headline.text = "Pagamento seguro"
    headline.textColor = .white
    headline.font = .systemFont(ofSize: 28, weight: .black)
    headline.textAlignment = .center

    let explanation = UILabel()
    explanation.text =
      "Os dados do cartão ficam nos campos seguros do Mercado Pago. " +
      "O Ramo Nessa recebe apenas um token temporário."
    explanation.textColor = UIColor(white: 0.74, alpha: 1)
    explanation.font = .systemFont(ofSize: 14)
    explanation.numberOfLines = 0
    explanation.textAlignment = .center

    let holderLabel = makeLabel("Titular do cartão")
    let cpfLabel = makeLabel("CPF do titular")
    let cardLabel = makeLabel("Número do cartão")
    let expirationLabel = makeLabel("Validade")
    let securityLabel = makeLabel("CVV")

    let details = UIStackView()
    details.axis = .horizontal
    details.spacing = 12
    details.distribution = .fillEqually

    let expirationStack = UIStackView(arrangedSubviews: [expirationLabel, expirationField])
    expirationStack.axis = .vertical
    expirationStack.spacing = 7

    let securityStack = UIStackView(arrangedSubviews: [securityLabel, securityField])
    securityStack.axis = .vertical
    securityStack.spacing = 7

    details.addArrangedSubview(expirationStack)
    details.addArrangedSubview(securityStack)

    let securityNote = UILabel()
    securityNote.text = "À vista (1x) · Proteção PCI · Mercado Pago"
    securityNote.textColor = UIColor(white: 0.5, alpha: 1)
    securityNote.font = .systemFont(ofSize: 12)
    securityNote.textAlignment = .center

    [
      mark,
      headline,
      explanation,
      holderLabel,
      holderField,
      cpfLabel,
      cpfField,
      cardLabel,
      cardNumberField,
      details,
      statusLabel,
      progress,
      submitButton,
      securityNote,
    ].forEach { stack.addArrangedSubview($0) }

    view.addSubview(scroll)
    scroll.addSubview(stack)

    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
      stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -24),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -28),

      holderField.heightAnchor.constraint(equalToConstant: 58),
      cpfField.heightAnchor.constraint(equalToConstant: 58),
      cardNumberField.heightAnchor.constraint(equalToConstant: 58),
      expirationField.heightAnchor.constraint(equalToConstant: 58),
      securityField.heightAnchor.constraint(equalToConstant: 58),
      submitButton.heightAnchor.constraint(equalToConstant: 58),
      progress.heightAnchor.constraint(greaterThanOrEqualToConstant: 24),
    ])
  }

  private func makePlainField(
    placeholder: String,
    keyboard: UIKeyboardType
  ) -> UITextField {
    let field = UITextField()
    field.translatesAutoresizingMaskIntoConstraints = false
    field.placeholder = placeholder
    field.keyboardType = keyboard
    field.textColor = brandBlack
    field.backgroundColor = .white
    field.font = .systemFont(ofSize: 16)
    field.layer.cornerRadius = 16
    field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 16, height: 1))
    field.leftViewMode = .always
    field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 16, height: 1))
    field.rightViewMode = .always
    if keyboard == .numberPad {
      field.textContentType = nil
    } else {
      field.textContentType = .name
      field.autocapitalizationType = .words
    }
    return field
  }

  private func makeLabel(_ text: String) -> UILabel {
    let label = UILabel()
    label.text = text
    label.textColor = .white
    label.font = .systemFont(ofSize: 13, weight: .bold)
    return label
  }

  @objc private func plainFieldChanged() {
    updateSubmitState()
  }

  private func loadPaymentMethod(bin: String) {
    paymentLookupGeneration += 1
    let generation = paymentLookupGeneration

    loadingMethod = true
    singlePaymentAvailable = false
    paymentMethodId = nil
    paymentMethodType = nil
    statusLabel.text = "Validando seu cartão para pagamento à vista…"
    updateSubmitState()

    Task { [weak self] in
      guard let self else { return }

      do {
        let methods = try await self.coreMethods.paymentMethods(bin: bin)
        guard generation == self.paymentLookupGeneration else { return }

        guard let method = methods.first(where: {
          $0.paymentTypeId == "credit_card" || $0.paymentTypeId == "debit_card"
        }) else {
          self.statusLabel.text = "Este cartão não está disponível para pagamento."
          self.loadingMethod = false
          self.updateSubmitState()
          return
        }

        self.cardNumberField.setMaxLength(method.card?.length.max ?? 19)
        self.securityField.setMaxLength(method.card?.securityCode.length ?? 3)

        let installments = try await self.coreMethods.installments(
          amount: Double(self.amountCents) / 100.0,
          bin: bin
        )
        guard generation == self.paymentLookupGeneration else { return }

        let matchingInstallment =
          installments.first(where: { $0.paymentMethodId == method.id }) ??
          installments.first

        let supportsSinglePayment =
          matchingInstallment?.payerCosts.contains(where: {
            $0.installments == 1
          }) == true

        guard supportsSinglePayment else {
          self.statusLabel.text =
            "Este cartão não permite pagamento à vista para este valor."
          self.loadingMethod = false
          self.updateSubmitState()
          return
        }

        self.paymentMethodId = method.id
        self.paymentMethodType = method.paymentTypeId
        self.singlePaymentAvailable = true
        self.loadingMethod = false
        self.statusLabel.text = "Cartão válido para pagamento à vista."
        self.updateSubmitState()
      } catch {
        guard generation == self.paymentLookupGeneration else { return }
        self.paymentMethodId = nil
        self.paymentMethodType = nil
        self.singlePaymentAvailable = false
        self.loadingMethod = false
        self.statusLabel.text = "Não conseguimos validar este cartão agora."
        self.updateSubmitState()
      }
    }
  }

  @objc private func tokenize() {
    guard !tokenizing && !loadingMethod else { return }

    let holder = holderField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let cpf = (cpfField.text ?? "").filter(\.isNumber)

    guard holder.count >= 2 else {
      statusLabel.text = "Informe o nome do titular do cartão."
      holderField.becomeFirstResponder()
      return
    }

    guard isValidCPF(cpf) else {
      statusLabel.text = "Informe um CPF válido do titular."
      cpfField.becomeFirstResponder()
      return
    }

    guard
      singlePaymentAvailable,
      cardNumberField.isValid,
      expirationField.isValid,
      securityField.isValid,
      let methodId = paymentMethodId,
      let methodType = paymentMethodType,
      methodType == "credit_card" || methodType == "debit_card"
    else {
      statusLabel.text = "Confira os dados do cartão para continuar."
      return
    }

    tokenizing = true
    progress.startAnimating()
    statusLabel.text = "Protegendo seus dados…"
    updateSubmitState()

    let cpfType = IdentificationType(name: "CPF")

    Task { [weak self] in
      guard let self else { return }

      do {
        let token = try await self.coreMethods.createToken(
          cardNumber: self.cardNumberField,
          expirationDate: self.expirationField,
          securityCode: self.securityField,
          documentType: cpfType,
          documentNumber: cpf,
          cardHolderName: holder
        )

        guard !token.token.isEmpty else {
          throw RamoCardFlowError(
            code: "CARD_TOKEN_INVALID",
            message: "O Mercado Pago não retornou um token válido."
          )
        }

        self.tokenizing = false
        self.progress.stopAnimating()
        self.completion(
          .success(
            RamoCardTokenizationPayload(
              token: token.token,
              paymentMethodId: methodId,
              paymentMethodType: methodType,
              lastFourDigits: token.lastFourDigits ?? self.lastFourDigits
            )
          )
        )
      } catch let error as RamoCardFlowError {
        self.tokenizing = false
        self.progress.stopAnimating()
        self.statusLabel.text = error.message
        self.updateSubmitState()
      } catch {
        self.tokenizing = false
        self.progress.stopAnimating()
        self.statusLabel.text = "Não conseguimos proteger o cartão agora."
        self.updateSubmitState()
      }
    }
  }

  private func updateSubmitState() {
    let holder = holderField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let cpf = (cpfField.text ?? "").filter(\.isNumber)

    let enabled =
      !tokenizing &&
      !loadingMethod &&
      singlePaymentAvailable &&
      holder.count >= 2 &&
      isValidCPF(cpf) &&
      cardNumberField.isValid &&
      expirationField.isValid &&
      securityField.isValid &&
      paymentMethodId != nil &&
      (paymentMethodType == "credit_card" || paymentMethodType == "debit_card")

    submitButton.isEnabled = enabled
    submitButton.alpha = enabled ? 1 : 0.45
  }

  private func isValidCPF(_ value: String) -> Bool {
    let digits = value.compactMap(\.wholeNumberValue)
    guard digits.count == 11, Set(digits).count > 1 else { return false }

    func checkDigit(length: Int) -> Int {
      var sum = 0
      var weight = length + 1
      for index in 0..<length {
        sum += digits[index] * weight
        weight -= 1
      }
      let remainder = (sum * 10) % 11
      return remainder == 10 ? 0 : remainder
    }

    return checkDigit(length: 9) == digits[9] &&
      checkDigit(length: 10) == digits[10]
  }

  @objc private func cancel() {
    completion(.cancelled)
  }
}
