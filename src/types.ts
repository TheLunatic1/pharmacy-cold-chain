/**
 * Shared Type Definitions for Case 1: Pharmacy Cold Chain to Inpatient Floor
 */

// ==========================================
// Step 1: Prescription Types (FHIR MedicationRequest)
// ==========================================
export interface MedicationRequestSummary {
  id: string;
  status: string;
  intent: string;
  rxcui: string;
  medicationDisplay: string;
  dosageText: string;
  doseValue?: number;
  doseUnit?: string;
  routeCode?: string;
  routeDisplay?: string;
  patientReference: string;
  patientDisplay?: string;
  requesterDisplay?: string;
  coldChainNotes?: string;
  rawResource?: Record<string, unknown>;
}

// ==========================================
// Step 2: RxNorm / RxNav Terminology Validation
// ==========================================
export interface RxNormConceptProperty {
  rxcui: string;
  name: string;
  tty: string;
  synonym?: string;
}

export interface DrugValidationResult {
  isValid: boolean;
  isCurrent: boolean;
  rxcui: string;
  prescribedName: string;
  termType: string;
  doseForm: string;
  activeIngredients: string[];
  matchingClinicalDrugs: string[];
  validationMessage: string;
  evaluatedAt: string;
}

// ==========================================
// Step 3: HL7 v2 OMP^O09 Parsing Types
// ==========================================
export interface PatientDemographicsInternal {
  mrn: string;
  fullName: string;
  familyName: string;
  givenName: string;
  dob: string;
  gender: string;
  phone: string;
  address: string;
}

export interface LocationDetail {
  pointOfCare: string; // e.g. "4W"
  room: string;        // e.g. "402"
  bed: string;         // e.g. "B"
  facility: string;    // e.g. "IPD"
  formattedLocation: string; // e.g. "Room 402, Bed B (4W)"
}

export interface CourierDetail {
  id: string;
  fullName: string;
  familyName: string;
  givenName: string;
  role: string;
  displayFirstNameOrRole: string; // Sanitized for nurse alert (e.g. "Marcus (Courier)" or "Courier Marcus")
}

export interface HL7DeliveryEvent {
  messageId: string;
  messageType: string; // "OMP^O09"
  timestamp: string;
  orderControl: string; // "OK", "NW", etc.
  placerOrderNumber: string;
  fillerOrderNumber: string;
  patientInternal: PatientDemographicsInternal; // Full internal PHI
  location: LocationDetail;
  rxcui: string;
  drugDisplay: string;
  giveAmount: string;
  giveUnits: string;
  route: string;
  courier: CourierDetail;
  etaTimestamp: string;
  storageCondition: string;
  rawHL7?: string;
}

// ==========================================
// Step 4: FHIR MedicationDispense Types
// ==========================================
export interface DispenseCreationParams {
  prescriptionId: string;
  patientReference: string;
  rxcui: string;
  drugDisplay: string;
  courier: CourierDetail;
  etaIsoString: string;
  storageCondition: string;
  roomBedDisplay: string;
}

export interface DispenseCreationResult {
  id: string;
  status: string;
  medicationDisplay: string;
  patientReference: string;
  performerDisplay: string;
  whenHandedOver: string;
  etaExtensionValue: string;
  rawResource: Record<string, unknown>;
}

// ==========================================
// Step 5a: PHI-Stripped Nurse Alert Payload
// ==========================================
export interface NurseAlertPayload {
  alertType: 'COLD_CHAIN_MEDICATION_IN_TRANSIT';
  destinationRoom: string;
  destinationBed: string;
  destinationDisplay: string;
  medication: string;
  courier: string;
  estimatedArrival: string;
  coldChainNotice: string;
  dispatchedAt: string;
}

// ==========================================
// Step 5b: FHIR AuditEvent Types
// ==========================================
export interface AuditEventCreationParams {
  action: 'C' | 'R' | 'U' | 'D' | 'E'; // C = Create, R = Read/View
  patientReference: string;
  medicationRequestId: string;
  medicationDispenseId?: string;
  actorName: string;
  description: string;
}

export interface AuditEventResult {
  id: string;
  action: string;
  recorded: string;
  outcome: string;
  actor: string;
  patientEntity: string;
  rawResource: Record<string, unknown>;
}
