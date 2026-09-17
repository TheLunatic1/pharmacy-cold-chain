/**
 * Step 5a: PHI-Stripped Nurse Alert Payload Builder (HIPAA Data Minimization)
 *
 * Implements strict HIPAA Safe Harbor & Minimum Necessary compliance for outbound
 * push notifications sent to nurse pagers / mobile devices.
 *
 * Pattern: Explicit Allowlist (Strict Whitelist)
 * NEVER uses blocklists or delete properties. Constructs a brand-new object
 * extracting only the operational identifiers necessary for drug delivery reception.
 *
 * Allowed Fields:
 * - Destination Room & Bed (Location only, no patient identity)
 * - Medication Name / Formulation (Clinical safety)
 * - Courier First Name or Role (Security verification on arrival)
 * - Estimated Arrival Time (ETA) & Cold-chain storage warning
 *
 * Prohibited & Excluded PHI:
 * - Patient Full Name (First, Last, Middle)
 * - Medical Record Number (MRN / Patient ID)
 * - Date of Birth (DOB)
 * - Phone Number
 * - Street Address
 * - Social Security / Account Numbers
 */

import type { HL7DeliveryEvent, NurseAlertPayload } from '../types.js';

export interface AlertInputContext {
  event: HL7DeliveryEvent;
  prescriptionId?: string;
  dispenseId?: string;
}

/**
 * Builds a strictly sanitized, PHI-free nurse notification payload.
 * Uses an explicit allowlist pattern.
 */
export function buildNurseAlertPayload(context: AlertInputContext): NurseAlertPayload {
  const { event } = context;

  // 1. Extract ONLY non-identifying location identifiers
  const destinationRoom = (event.location.room || '').trim();
  const destinationBed = (event.location.bed || '').trim();
  const pointOfCare = (event.location.pointOfCare || '').trim();
  const destinationDisplay = `Room ${destinationRoom}, Bed ${destinationBed}${
    pointOfCare ? ` (${pointOfCare})` : ''
  }`;

  // 2. Extract medication name
  const medication = (event.drugDisplay || 'Cold-Chain Medication').trim();

  // 3. Extract sanitized courier representation (first name or role only)
  const courier = (event.courier.displayFirstNameOrRole || 'Assigned Courier').trim();

  // 4. Extract ETA and cold-chain instructions
  const estimatedArrival = (event.etaTimestamp || '').trim();
  const coldChainNotice = event.storageCondition || 'Keep Refrigerated (2°C - 8°C)';

  // 5. Build immutable allowlist payload
  const alert: NurseAlertPayload = {
    alertType: 'COLD_CHAIN_MEDICATION_IN_TRANSIT',
    destinationRoom,
    destinationBed,
    destinationDisplay,
    medication,
    courier,
    estimatedArrival,
    coldChainNotice,
    dispatchedAt: new Date().toISOString(),
  };

  return Object.freeze(alert);
}

/**
 * Audit verification helper to validate that a generated payload contains zero PHI
 * Returns true if clean, throws an error if any known PHI is detected.
 */
export function assertNoPhiInAlert(alert: NurseAlertPayload, phiSource: HL7DeliveryEvent): boolean {
  const serializedAlert = JSON.stringify(alert).toLowerCase();
  const patient = phiSource.patientInternal;

  const forbiddenPhiValues = [
    patient.fullName,
    patient.familyName,
    patient.givenName,
    patient.mrn,
    patient.phone,
    patient.address,
    patient.dob,
  ]
    .filter(Boolean)
    .map((v) => v.toLowerCase().trim())
    .filter((v) => v.length > 2); // ignore single characters

  for (const forbidden of forbiddenPhiValues) {
    if (serializedAlert.includes(forbidden)) {
      throw new Error(`HIPAA VIOLATION DETECTED: PHI value "${forbidden}" was found in nurse alert payload!`);
    }
  }

  return true;
}
