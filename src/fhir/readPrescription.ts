/**
 * Step 1: Read the Doctor's Prescription (HL7 FHIR MedicationRequest)
 *
 * Queries the EHR via standard FHIR R4 REST API to inspect the official order.
 * Extracts RxNorm terminology coding, dosage instructions, and patient references.
 * Implements resilient sandbox seeding with offline fixture fallback.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';
import type { MedicationRequestSummary } from '../types.js';
import { FhirClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load the bundled sample fixture from disk (for fallback)
 */
export function loadSamplePrescriptionFixture(): Record<string, unknown> {
  const fixturePath = path.resolve(__dirname, '../../fixtures/medication-request-sample.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Helper to parse a raw FHIR MedicationRequest resource into a clean summary
 */
export function parseMedicationRequest(resource: Record<string, unknown>): MedicationRequestSummary {
  const id = (resource['id'] as string) || 'UNKNOWN_ID';
  const status = (resource['status'] as string) || 'unknown';
  const intent = (resource['intent'] as string) || 'unknown';

  // Extract RxNorm Code from medicationCodeableConcept
  let rxcui = '';
  let medicationDisplay = '';

  const medConcept = resource['medicationCodeableConcept'] as Record<string, unknown> | undefined;
  if (medConcept) {
    medicationDisplay = (medConcept['text'] as string) || '';
    const codings = (medConcept['coding'] as Array<Record<string, unknown>>) || [];

    // Prioritize official RxNorm system coding
    const rxNormCoding = codings.find((c) => {
      const sys = (c['system'] as string) || '';
      return sys.includes('rxnorm') || sys === CONFIG.SYSTEMS.RXNORM;
    });

    if (rxNormCoding) {
      rxcui = String(rxNormCoding['code'] || '');
      medicationDisplay = (rxNormCoding['display'] as string) || medicationDisplay;
    } else if (codings.length > 0 && codings[0]) {
      rxcui = String(codings[0]['code'] || '');
      medicationDisplay = (codings[0]['display'] as string) || medicationDisplay;
    }
  }

  // Fallback to config sample if not found in codings
  if (!rxcui) {
    rxcui = CONFIG.SAMPLE_DRUG.RXCUI_BRANDED;
  }
  if (!medicationDisplay) {
    medicationDisplay = CONFIG.SAMPLE_DRUG.NAME;
  }

  // Extract Patient (Subject)
  const subject = (resource['subject'] as Record<string, unknown>) || {};
  const patientReference = (subject['reference'] as string) || 'Patient/ipd-pat-89124';
  const patientDisplay = (subject['display'] as string) || 'Eleanor Vance';

  // Extract Requester
  const requester = (resource['requester'] as Record<string, unknown>) || {};
  const requesterDisplay = (requester['display'] as string) || (requester['reference'] as string) || 'Dr. Gregory House, MD';

  // Extract Dosage Instruction
  const dosageInstructions = (resource['dosageInstruction'] as Array<Record<string, unknown>>) || [];
  let dosageText = 'Take as directed by inpatient protocol';
  let doseValue: number | undefined;
  let doseUnit: string | undefined;
  let routeCode: string | undefined;
  let routeDisplay: string | undefined;

  if (dosageInstructions.length > 0 && dosageInstructions[0]) {
    const firstDose = dosageInstructions[0];
    dosageText = (firstDose['text'] as string) || dosageText;

    const route = firstDose['route'] as Record<string, unknown> | undefined;
    if (route) {
      const routeCodings = (route['coding'] as Array<Record<string, unknown>>) || [];
      if (routeCodings.length > 0 && routeCodings[0]) {
        routeCode = String(routeCodings[0]['code'] || '');
        routeDisplay = (routeCodings[0]['display'] as string) || '';
      }
    }

    const doseAndRates = (firstDose['doseAndRate'] as Array<Record<string, unknown>>) || [];
    if (doseAndRates.length > 0 && doseAndRates[0]) {
      const doseQuantity = doseAndRates[0]['doseQuantity'] as Record<string, unknown> | undefined;
      if (doseQuantity) {
        doseValue = Number(doseQuantity['value']);
        doseUnit = (doseQuantity['unit'] as string) || (doseQuantity['code'] as string);
      }
    }
  }

  // Extract Notes / Cold chain requirements
  const notes = (resource['note'] as Array<Record<string, unknown>>) || [];
  const coldChainNotes = notes.map((n) => n['text']).filter(Boolean).join(' | ');

  return {
    id,
    status,
    intent,
    rxcui,
    medicationDisplay,
    dosageText,
    doseValue,
    doseUnit,
    routeCode,
    routeDisplay,
    patientReference,
    patientDisplay,
    requesterDisplay,
    coldChainNotes,
    rawResource: resource,
  };
}

/**
 * Fetch or seed a live MedicationRequest against HAPI FHIR sandbox.
 * Automatically falls back to offline fixture if the sandbox is unavailable.
 */
export async function getOrCreateMedicationRequest(
  client: FhirClient = new FhirClient(),
  specificId?: string
): Promise<{ summary: MedicationRequestSummary; isFromSandbox: boolean; isCreated: boolean }> {
  // 1. If a specific ID was given, attempt direct fetch
  if (specificId) {
    try {
      const fetched = await client.get<Record<string, unknown>>(`MedicationRequest/${specificId}`);
      return {
        summary: parseMedicationRequest(fetched),
        isFromSandbox: true,
        isCreated: false,
      };
    } catch (err) {
      console.warn(`[Prescription] Could not fetch MedicationRequest/${specificId} from sandbox: ${(err as Error).message}`);
    }
  }

  // 2. Attempt to create a live cold-chain MedicationRequest in the sandbox
  try {
    // First, ensure a live Patient resource exists for referential integrity in HAPI FHIR
    let livePatientRef = 'Patient/ipd-pat-89124';
    try {
      const createdPatient = await client.post<Record<string, unknown>>('Patient', {
        resourceType: 'Patient',
        meta: {
          tag: [
            {
              system: 'https://hospital.org/tags',
              code: CONFIG.DEMO_TAG,
              display: 'Case 1 Cold Chain IPD Demo',
            },
          ],
        },
        identifier: [
          {
            system: 'https://hospital.org/mrn',
            value: 'MRN89124',
          },
        ],
        name: [
          {
            use: 'official',
            family: 'Vance',
            given: ['Eleanor', 'M'],
          },
        ],
        gender: 'female',
        birthDate: '1982-04-15',
      });
      if (createdPatient['id']) {
        livePatientRef = `Patient/${createdPatient['id']}`;
      }
    } catch {
      // If Patient creation fails, proceed with default reference
    }

    const fixture = loadSamplePrescriptionFixture();
    // Remove local static ID so HAPI FHIR assigns a real server ID
    const { id: _staticId, encounter: _encounter, requester: _requester, ...payloadToPost } = fixture;

    // Attach live Patient reference and clean requester
    payloadToPost['subject'] = {
      reference: livePatientRef,
      display: 'Eleanor Vance',
    };
    payloadToPost['requester'] = {
      display: 'Dr. Gregory House, MD',
    };
    payloadToPost['identifier'] = [
      {
        system: 'https://hospital.org/orders',
        value: `ORD-2026-CC-${Date.now()}`,
      },
    ];

    // Add identifier tag for traceable live queries
    const created = await client.post<Record<string, unknown>>('MedicationRequest', {
      ...payloadToPost,
      meta: {
        tag: [
          {
            system: 'https://hospital.org/tags',
            code: CONFIG.DEMO_TAG,
            display: 'Case 1 Cold Chain IPD Demo',
          },
        ],
      },
    });

    const parsedSummary = parseMedicationRequest(created);
    // Ensure patient reference points to the live patient
    parsedSummary.patientReference = livePatientRef;

    return {
      summary: parsedSummary,
      isFromSandbox: true,
      isCreated: true,
    };
  } catch (liveError) {
    console.warn(`[Prescription] Sandbox write failed, falling back to bundled offline fixture: ${(liveError as Error).message}`);
    const localFixture = loadSamplePrescriptionFixture();
    return {
      summary: parseMedicationRequest(localFixture),
      isFromSandbox: false,
      isCreated: false,
    };
  }
}
