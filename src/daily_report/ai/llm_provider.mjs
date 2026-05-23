import { createRuleBasedProvider } from './rule_based_provider.mjs';

const RULE_BASED_PROVIDER_NAMES = new Set(['', 'rule_based', 'local', 'fallback']);

export function getConfiguredProviderName(env = process.env) {
  return String(env.DAILY_REPORT_AI_PROVIDER || 'rule_based').trim().toLowerCase();
}

export function createMarketAiProvider(options = {}) {
  const providerName = String(options.providerName || getConfiguredProviderName()).trim().toLowerCase();

  if (RULE_BASED_PROVIDER_NAMES.has(providerName)) {
    return createRuleBasedProvider();
  }

  const fallback = createRuleBasedProvider();
  return {
    ...fallback,
    id: 'rule_based',
    requested_provider: providerName,
    fallback_reason: `Provider "${providerName}" is not implemented yet.`,
  };
}

export function getAiProviderStatus(env = process.env) {
  const requested = getConfiguredProviderName(env);
  const active = RULE_BASED_PROVIDER_NAMES.has(requested) ? 'rule_based' : 'rule_based';
  return {
    requested_provider: requested || 'rule_based',
    active_provider: active,
    available_providers: ['rule_based'],
    external_provider_enabled: false,
    fallback_active: !RULE_BASED_PROVIDER_NAMES.has(requested),
  };
}
