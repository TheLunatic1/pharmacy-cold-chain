/**
 * Application Configuration & Constants
 *
 * Case 1: Pharmacy Cold Chain to Inpatient Floor (IPD)
 */

export const CONFIG = {
  // Public HAPI FHIR R4 Test Sandbox
  FHIR_BASE_URL: process.env['FHIR_BASE_URL'] || 'https://hapi.fhir.org/baseR4',

  // NLM RxNav REST API
  RXNAV_BASE_URL: process.env['RXNAV_BASE_URL'] || 'https://rxnav.nlm.nih.gov/REST',

  // Terminology Code Systems
  SYSTEMS: {
    RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
    SNOMED_CT: 'http://snomed.info/sct',
    UCUM: 'http://unitsofmeasure.org',
    MEDICATION_REQUEST_CATEGORY: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
    DOSE_RATE_TYPE: 'http://terminology.hl7.org/CodeSystem/dose-rate-type',
    AUDIT_EVENT_TYPE: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
    AUDIT_EVENT_SUB_TYPE: 'http://hl7.org/fhir/restful-interaction',
    AUDIT_ENTITY_ROLE: 'http://terminology.hl7.org/CodeSystem/object-role',
  },

  // Cold-Chain Target Drug (Insulin Glargine 100 UNT/ML)
  SAMPLE_DRUG: {
    RXCUI_BRANDED: '285018', // Lantus 100 UNT/ML Injectable Solution (SBD)
    RXCUI_CLINICAL: '311041', // insulin glargine 100 UNT/ML Injectable Solution (SCD)
    NAME: 'insulin glargine 100 UNT/ML Injectable Solution [Lantus]',
    TEMPERATURE_SPEC: '2°C to 8°C (Refrigerated - Cold Chain)',
    STORAGE_CONDITION: 'KEEP_REFRIGERATED_DO_NOT_FREEZE',
  },

  // Identifier tag for idempotent sandbox query/seeding
  DEMO_TAG: 'cold-chain-ipd-demo-v1',
} as const;
