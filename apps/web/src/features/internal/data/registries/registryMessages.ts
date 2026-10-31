// Keys follow the resource and field codes returned by the catalog registry API.
// Stored IDs, enum values and editable record content remain unchanged.
export const REGISTRY_MESSAGE_KEYS: Record<string, { title: string; fields: Record<string, string> }> = {
  "families": {
    "title": "Catalogue.models.families",
    "fields": {
      "family_slug": "Common.ui.pricingEditorCopy.familyID",
      "name": "Common.ui.chatComposer.name",
      "lab_slug": "Common.ui.modelEditor.advanced.organization",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata"
    }
  },
  "service-tiers": {
    "title": "Common.ui.pricingEditorCopy.serviceTiers",
    "fields": {
      "service_tier_slug": "Common.ui.pricingEditorCopy.tierID",
      "display_name": "Common.ui.chatComposer.name",
      "description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "status": "Common.ui.modelCreation.status",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata"
    }
  },
  "meters": {
    "title": "Common.ui.pricingEditorCopy.meterDefinitions",
    "fields": {
      "meter_key": "Common.ui.pricingEditorCopy.meterID",
      "display_name": "Common.ui.chatComposer.name",
      "modality": "Common.ui.versionedPricing.modality",
      "direction": "Common.ui.modelCreation.form.direction",
      "unit": "Common.ui.versionedPricing.unit",
      "default_unit_quantity": "Common.ui.pricingEditorCopy.unitsPerPrice",
      "description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "status": "Common.ui.modelCreation.status",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata"
    }
  },
  "regions": {
    "title": "Common.ui.pricingEditorCopy.providerRegions",
    "fields": {
      "provider_region_id": "Product.chatRooms.identifier",
      "provider_slug": "Common.ui.modelEditor.mainCopy.aliasProvider",
      "region_code": "Common.ui.pricingEditorCopy.regionCode",
      "display_name": "Common.ui.chatComposer.name",
      "execution_supported": "Common.ui.pricingEditorCopy.executionSupported",
      "data_residency_supported": "Common.ui.pricingEditorCopy.dataResidencySupported",
      "routing_enabled": "Common.ui.pricingEditorCopy.routingEnabled",
      "status": "Common.ui.modelCreation.status",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata"
    }
  },
  "variants": {
    "title": "Common.ui.pricingEditorCopy.routeVariants",
    "fields": {
      "variant_id": "Product.chatRooms.identifier",
      "provider_model_id": "Common.ui.versionedPricing.providerRoute",
      "variant_key": "Common.ui.pricingEditorCopy.variantKey",
      "provider_region_id": "Common.ui.pricingEditorCopy.providerRegion",
      "execution_region": "Common.ui.pricingEditorCopy.executionRegion",
      "data_region": "Common.ui.pricingEditorCopy.dataRegion",
      "service_tier_slug": "Common.ui.versionedPricing.serviceTier",
      "status": "Common.ui.modelCreation.status",
      "routing_enabled": "Common.ui.pricingEditorCopy.routingEnabled",
      "endpoint_label": "Common.ui.pricingEditorCopy.endpointLabel",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata"
    }
  },
  "plans": {
    "title": "Common.search.subscriptionPlans",
    "fields": {
      "plan_uuid": "Product.chatRooms.identifier",
      "plan_id": "Common.ui.modelCreation.form.planId",
      "name": "Common.ui.chatComposer.name",
      "lab_slug": "Common.ui.modelEditor.advanced.organization",
      "description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "frequency": "Common.ui.modelEditor.billingFrequency",
      "price": "Common.ui.versionedPricing.price",
      "currency": "Common.ui.versionedPricing.currency",
      "link": "Common.ui.pricingEditorCopy.planURL",
      "other_info": "Common.ui.pricingEditorCopy.additionalInformation",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "plan-features": {
    "title": "Common.ui.pricingEditorCopy.planFeatures",
    "fields": {
      "plan_uuid": "Catalogue.models.planFallback",
      "feature_name": "Common.ui.pricingEditorCopy.featureName",
      "feature_value": "Common.ui.modelEditor.value",
      "feature_description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "other_info": "Common.ui.pricingEditorCopy.additionalInformation",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  }
};

export const REGISTRY_OPTION_MESSAGE_KEYS: Record<string, string> = {
  "active": "Common.ui.modelEditor.modelStatuses.active",
  "deprecated": "Common.ui.modelEditor.modelStatuses.deprecated",
  "disabled": "Common.ui.modelEditor.capabilityStatuses.disabled",
  "text": "Common.ui.modelCreation.modalities.text",
  "image": "Catalogue.modelDetail.pricing.unitsSingular.image",
  "audio": "Common.ui.modelCreation.modalities.audio",
  "video": "Common.ui.modelCreation.modalities.video",
  "embedding": "Common.ui.modelCreation.modalities.embedding",
  "request": "Catalogue.modelDetail.pricing.unitsSingular.request",
  "tool": "Common.ui.pricingEditorCopy.tool",
  "other": "Common.status.groups.other",
  "input": "Common.ui.select.input",
  "output": "Common.ui.select.output",
  "token": "Catalogue.modelDetail.pricing.unitsSingular.token",
  "second": "Catalogue.modelDetail.pricing.unitsSingular.second",
  "minute": "Catalogue.modelDetail.pricing.unitsSingular.minute",
  "character": "Catalogue.modelDetail.pricing.unitsSingular.character",
  "call": "Common.ui.pricingEditorCopy.call",
  "megapixel": "Common.ui.pricingEditorCopy.megapixel",
  "degraded": "Common.status.componentStates.degraded",
  "retired": "Common.ui.modelEditor.modelStatuses.retired",
  "monthly": "Catalogue.modelDetail.sections.monthly",
  "yearly": "Catalogue.modelDetail.sections.yearly",
  "weekly": "Catalogue.modelDetail.sections.weekly",
  "daily": "Catalogue.modelDetail.sections.daily",
  "one-time": "Common.ui.modelEditor.oneTime",
  "free": "Common.ui.chatSettings.free"
};

Object.assign(REGISTRY_MESSAGE_KEYS, {
  "plans": {
    "title": "Common.search.palette.navigationItems.nav-plans",
    "fields": {
      "plan_uuid": "Product.chatRooms.identifier",
      "plan_id": "Common.ui.modelCreation.form.planId",
      "name": "Common.ui.chatComposer.name",
      "lab_slug": "Common.search.palette.context.entities.organisation",
      "description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "audience": "Common.ui.subscriptionCatalog.audience",
      "status": "Common.ui.modelCreation.status",
      "link": "Common.ui.pricingEditorCopy.planURL",
      "other_info": "Common.ui.pricingEditorCopy.additionalInformation",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "plan-offers": {
    "title": "Common.ui.subscriptionCatalog.plan_offers",
    "fields": {
      "offer_uuid": "Product.chatRooms.identifier",
      "plan_uuid": "Catalogue.models.planFallback",
      "label": "Common.ui.versionedPricing.label",
      "billing_interval": "Common.ui.subscriptionCatalog.billing_interval",
      "billing_interval_count": "Common.ui.subscriptionCatalog.interval_count",
      "currency": "Common.ui.versionedPricing.currency",
      "region_code": "Common.ui.versionedPricing.region",
      "minimum_seats": "Common.ui.subscriptionCatalog.minimum_seats",
      "tax_treatment": "Common.ui.subscriptionCatalog.taxes",
      "eligibility": "Common.ui.subscriptionCatalog.eligibility",
      "purchase_url": "Common.ui.subscriptionCatalog.purchase_url",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "offer-prices": {
    "title": "Common.ui.subscriptionCatalog.offer_prices",
    "fields": {
      "price_uuid": "Product.chatRooms.identifier",
      "offer_uuid": "Common.ui.versionedPricing.offer",
      "component_key": "Common.ui.subscriptionCatalog.component",
      "pricing_type": "Common.ui.subscriptionCatalog.pricing_type",
      "amount": "Product.internalTools.promoCredits.tableAmount",
      "charge_basis": "Common.ui.subscriptionCatalog.charge_basis",
      "seat_type": "Common.ui.subscriptionCatalog.seat_type",
      "unit": "Common.ui.versionedPricing.unit",
      "unit_quantity": "Common.ui.subscriptionCatalog.units_per_charge",
      "phase": "Common.ui.subscriptionCatalog.price_phase",
      "starts_at_cycle": "Common.ui.subscriptionCatalog.first_billing_cycle",
      "duration_cycles": "Common.ui.subscriptionCatalog.number_of_cycles",
      "display_text": "Common.ui.chatSettings.notes",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "feature-definitions": {
    "title": "Common.ui.subscriptionCatalog.subscription_features",
    "fields": {
      "feature_key": "Common.ui.subscriptionCatalog.feature_key",
      "label": "Common.ui.versionedPricing.label",
      "category": "Common.ui.modelCreation.form.category",
      "value_type": "Common.ui.modelEditor.valueType"
    }
  },
  "plan-features": {
    "title": "Common.ui.pricingEditorCopy.planFeatures",
    "fields": {
      "plan_uuid": "Catalogue.models.planFallback",
      "feature_name": "Common.ui.pricingEditorCopy.featureName",
      "feature_key": "Common.ui.subscriptionCatalog.feature",
      "availability": "Catalogue.compare.availability",
      "value_number": "Common.ui.subscriptionCatalog.numeric_value",
      "value_text": "Common.ui.modelEditor.textValue",
      "conditions": "Common.ui.modelEditor.conditions",
      "feature_value": "Common.ui.subscriptionCatalog.published_value",
      "feature_description": "Catalogue.models.detail.quickstart.descriptionLabel",
      "other_info": "Common.ui.pricingEditorCopy.additionalInformation",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "plan-allowances": {
    "title": "Common.ui.subscriptionCatalog.plan_allowances",
    "fields": {
      "allowance_uuid": "Product.chatRooms.identifier",
      "plan_uuid": "Catalogue.models.planFallback",
      "offer_uuid": "Common.ui.versionedPricing.offer",
      "feature_key": "Common.ui.subscriptionCatalog.feature",
      "allowance_key": "Common.ui.subscriptionCatalog.allowance_key",
      "allowance_kind": "SettingsUI.strings.Kind",
      "quantity": "Common.ui.versionedPricing.quantity",
      "quantity_max": "Common.ui.subscriptionCatalog.maximum_quantity",
      "quantity_kind": "Common.ui.subscriptionCatalog.quantity_qualifier",
      "unit": "Common.ui.versionedPricing.unit",
      "currency": "Common.ui.versionedPricing.currency",
      "window_kind": "SettingsUI.routingStudioLegacy.window",
      "window_unit": "Common.ui.subscriptionCatalog.window_unit",
      "window_count": "Common.ui.subscriptionCatalog.window_count",
      "allocation_basis": "Common.ui.subscriptionCatalog.allocation",
      "pool_scope": "Common.ui.subscriptionCatalog.pool_scope",
      "pool_key": "Common.ui.subscriptionCatalog.shared_pool_key",
      "grant_condition": "Common.ui.subscriptionCatalog.grant_condition",
      "comparison_plan_uuid": "Common.ui.subscriptionCatalog.comparison_plan",
      "comparison_feature_key": "Common.ui.subscriptionCatalog.comparison_feature",
      "overage_policy": "Common.ui.subscriptionCatalog.overage",
      "overage_price": "Common.ui.subscriptionCatalog.overage_price",
      "overage_currency": "Common.ui.subscriptionCatalog.overage_currency",
      "overage_unit_quantity": "Common.ui.subscriptionCatalog.overage_units",
      "overage_source_url": "Common.ui.subscriptionCatalog.overage_source",
      "conditions": "Common.ui.modelEditor.conditions",
      "display_text": "Common.ui.subscriptionCatalog.published_allowance",
      "metadata": "Common.ui.pricingEditorCopy.additionalMetadata",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  },
  "plan-model-access": {
    "title": "Common.ui.subscriptionCatalog.plan_model_access",
    "fields": {
      "plan_uuid": "Catalogue.models.planFallback",
      "model_slug": "Common.search.palette.context.entities.model",
      "access_mode": "Catalogue.modelDetail.sections.access",
      "access_channel": "SettingsUI.strings.channel",
      "conditions": "Common.ui.modelEditor.conditions",
      "mapping_status": "Common.ui.subscriptionCatalog.mapping_evidence",
      "model_info": "Common.ui.subscriptionCatalog.model_information",
      "rate_limit": "Common.ui.subscriptionCatalog.published_limits",
      "other_info": "Common.ui.pricingEditorCopy.additionalInformation",
      "source_url": "Common.ui.subscriptionCatalog.source_url",
      "verified_at": "Common.ui.subscriptionCatalog.verified_at",
      "effective_from": "Common.ui.subscriptionCatalog.start_date_utc",
      "effective_to": "Common.ui.pricingEditorCopy.endDateUTC"
    }
  }
});
Object.assign(REGISTRY_OPTION_MESSAGE_KEYS, {
  "individual": "Common.ui.subscriptionCatalog.individual",
  "team": "SettingsUI.strings.Team",
  "enterprise": "SettingsUI.headers.enterprise",
  "unknown": "Common.status.unknown",
  "active": "Common.ui.modelEditor.modelStatuses.active",
  "retired": "Common.ui.modelEditor.modelStatuses.retired",
  "day": "Common.ui.subscriptionCatalog.day",
  "week": "Common.ui.subscriptionCatalog.week",
  "month": "SettingsUI.teams.month",
  "year": "Catalogue.models.filtersUi.year",
  "included": "Catalogue.models.included",
  "excluded": "Common.ui.providerCardCopy.excluded",
  "free": "Common.ui.chatSettings.free",
  "fixed": "Common.ui.subscriptionCatalog.fixed",
  "starting_at": "Common.ui.subscriptionCatalog.starting_at",
  "custom": "Common.ui.select.custom",
  "usage_based": "Common.ui.subscriptionCatalog.usage_based",
  "account": "Common.ui.privacyEligibility.account",
  "seat": "Common.ui.subscriptionCatalog.seat",
  "unit": "Common.ui.versionedPricing.unit",
  "standard": "Common.ui.chatComposer.standard",
  "introductory": "Common.ui.subscriptionCatalog.introductory",
  "renewal": "SettingsUI.enterpriseIdentity.renewal",
  "boolean": "Common.ui.subscriptionCatalog.boolean",
  "number": "Common.ui.formTypes.number",
  "text": "Common.ui.modelCreation.modalities.text",
  "limited": "Common.ui.subscriptionCatalog.limited",
  "conditional": "Common.ui.subscriptionCatalog.conditional",
  "quota": "Common.ui.subscriptionCatalog.quota",
  "credit_grant": "Common.ui.subscriptionCatalog.credit_grant",
  "concurrency": "Product.internalTools.modelTestPlayground.concurrency",
  "relative_usage": "Common.ui.subscriptionCatalog.relative_usage",
  "exact": "Product.games.exact",
  "up_to": "Common.ui.subscriptionCatalog.up_to",
  "approximate": "Common.ui.subscriptionCatalog.approximate",
  "estimated": "Common.ui.subscriptionCatalog.estimated",
  "unlimited": "Product.tools.pricing.unlimited",
  "calendar": "Catalogue.updates.routes.calendar",
  "rolling": "Common.ui.subscriptionCatalog.rolling",
  "none": "Common.ui.modelEditor.none",
  "minute": "Catalogue.modelDetail.pricing.unitsSingular.minute",
  "hour": "Common.ui.subscriptionCatalog.hour",
  "workspace": "Common.dropdown.workspace",
  "organisation": "Common.search.palette.context.entities.organisation",
  "payer_account": "Common.ui.subscriptionCatalog.payer_account",
  "blocked": "Common.ui.chatSettings.blocked",
  "payg": "Common.ui.subscriptionCatalog.payg",
  "throttled": "Common.ui.subscriptionCatalog.throttled",
  "selectable": "Common.ui.subscriptionCatalog.selectable",
  "automatic": "Product.chat.errorNotice.automatic",
  "confirmed": "SettingsUI.realtimeCopy.confirmed",
  "example": "Common.ui.subscriptionCatalog.example",
  "unverified": "Common.ui.subscriptionCatalog.unverified"
});
