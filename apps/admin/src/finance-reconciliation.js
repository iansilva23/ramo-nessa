export function canReconcilePayouts({ config, canWrite, busy = false }) {
  return (
    canWrite === true &&
    busy !== true &&
    config?.canManage === true &&
    config?.providerConfigured === true
  );
}
export function reconciliationMessage(result) {
  const parts = [];
  let errors = 0;
  for (const [key, label] of [
    ['drivers', 'Motoristas'],
    ['company', 'Empresa'],
  ]) {
    const counters = result?.[key];
    if (
      !counters ||
      ['processed', 'paid', 'processing', 'failed', 'errors'].some(
        (field) =>
          !Number.isSafeInteger(counters[field]) || counters[field] < 0,
      )
    ) {
      throw new Error(
        'O provedor retornou um resultado de conciliação inválido. Atualize o Financeiro antes de repetir.',
      );
    }
    parts.push(
      `${label}: ${counters.paid} pagos, ${counters.processing} em processamento, ${counters.failed} falhos, ${counters.errors} erros de consulta.`,
    );
    errors += counters.errors + counters.failed;
  }
  return { text: parts.join(' '), tone: errors > 0 ? 'warning' : 'success' };
}
