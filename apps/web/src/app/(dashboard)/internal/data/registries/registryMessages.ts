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
