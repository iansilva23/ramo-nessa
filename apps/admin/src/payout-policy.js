export function parsePayoutPolicyAmounts(minimumText, feeText) {
  const cents = (value) => {
    const text = String(value ?? "").trim();
    if (!/^\d{1,7}([.,]\d{1,2})?$/.test(text))
      throw Error("Informe os valores em reais, com até duas casas decimais.");
    const [whole, fraction = ""] = text.replace(",", ".").split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  };
  const anticipationMinimumCents = cents(minimumText);
  const anticipationFeeCents = cents(feeText);
  if (
    anticipationMinimumCents < 1 ||
    anticipationMinimumCents > 100000000 ||
    anticipationFeeCents >= anticipationMinimumCents
  )
    throw Error(
      "O mínimo deve ser positivo, até R$ 1.000.000,00, e a taxa menor que ele.",
    );
  return { anticipationMinimumCents, anticipationFeeCents };
}

export function asaasIntegrationMessage(asaas) {
  if (asaas?.apiAvailable === true && asaas.status === "configured")
    return `Asaas configurada no servidor (${asaas.environment === "production" ? "produção" : "sandbox"}). O modo de repasse controla os envios; configurar não confirma uma transferência.`;
  if (asaas?.status === "disabled")
    return "Asaas desativada para envios no servidor. O pagamento manual pelo banco continua disponível.";
  return "Asaas aguardando configuração e homologação da API no servidor. Nenhuma chave é inserida neste painel.";
}
