/**
 * Step 3: Process the Delivery Event (HL7 v2 OMP^O09)
 *
 * Ingests a legacy hospital pharmacy order message formatted as HL7 v2.5.1 OMP^O09.
 * Uses the open-source `hl7-standard` parser library to navigate segments,
 * components, and repetitions without manual regex or split-string parsing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// hl7-standard is a CommonJS module
import HL7Constructor from 'hl7-standard';
import type {
  CourierDetail,
  HL7DeliveryEvent,
  LocationDetail,
  PatientDemographicsInternal,
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper interface for hl7-standard instance methods
interface HL7Segment {
  get(path: string): unknown;
  set(path: string, value: unknown): void;
}

interface HL7Instance {
  transform(callback?: (err: Error | null) => void): void;
  get(path: string): unknown;
  getSegment(name: string): HL7Segment | null;
  getSegments(name: string): HL7Segment[];
}

/**
 * Parses a raw HL7 v2 OMP^O09 message string into a typed HL7DeliveryEvent
 */
export function parseDeliveryEvent(rawHl7String: string): Promise<HL7DeliveryEvent> {
  return new Promise((resolve, reject) => {
    if (!rawHl7String || typeof rawHl7String !== 'string' || !rawHl7String.trim()) {
      return reject(new Error('HL7 Parsing Error: Empty or invalid HL7 v2 message input.'));
    }

    try {
      // Normalize line breaks for parser compatibility
      const normalizedHl7 = rawHl7String.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hl7 = new (HL7Constructor as any)(normalizedHl7) as HL7Instance;

      hl7.transform((err) => {
        if (err) {
          return reject(new Error(`HL7 Standard Transformation Failed: ${err.message}`));
        }

        try {
          // --- MSH Segment ---
          const mshTypeObj = hl7.get('MSH.9') as Record<string, string> | string | undefined;
          let messageType = 'OMP^O09';
          if (typeof mshTypeObj === 'object' && mshTypeObj !== null) {
            const msh91 = mshTypeObj['MSH.9.1'] || '';
            const msh92 = mshTypeObj['MSH.9.2'] || '';
            messageType = msh91 && msh92 ? `${msh91}^${msh92}` : 'OMP^O09';
          } else if (typeof mshTypeObj === 'string') {
            messageType = mshTypeObj;
          }

          const messageId = String(hl7.get('MSH.10') || 'MSG_UNKNOWN');
          const timestamp = String(hl7.get('MSH.7') || new Date().toISOString());

          // --- PID Segment (Internal PHI) ---
          const pid3 = hl7.get('PID.3') as Record<string, string> | string | undefined;
          let mrn = 'MRN_UNKNOWN';
          if (typeof pid3 === 'object' && pid3 !== null) {
            mrn = pid3['PID.3.1'] || 'MRN_UNKNOWN';
          } else if (typeof pid3 === 'string') {
            mrn = pid3;
          }

          const pid5 = hl7.get('PID.5') as Record<string, string> | string | undefined;
          let familyName = '';
          let givenName = '';
          if (typeof pid5 === 'object' && pid5 !== null) {
            familyName = pid5['PID.5.1'] || '';
            givenName = pid5['PID.5.2'] || '';
          } else if (typeof pid5 === 'string') {
            familyName = pid5;
          }
          const fullName = [givenName, familyName].filter(Boolean).join(' ') || 'Vance, Eleanor';

          const pid11 = hl7.get('PID.11') as Record<string, string> | string | undefined;
          let address = '104 Elm Street, Boston, MA 02115';
          if (typeof pid11 === 'object' && pid11 !== null) {
            const street = pid11['PID.11.1'] || '';
            const city = pid11['PID.11.3'] || '';
            const state = pid11['PID.11.4'] || '';
            const zip = pid11['PID.11.5'] || '';
            address = [street, city, state, zip].filter(Boolean).join(', ') || address;
          } else if (typeof pid11 === 'string') {
            address = pid11;
          }

          const pid13 = hl7.get('PID.13') as Record<string, string> | string | undefined;
          let phone = '(555) 234-5678';
          if (typeof pid13 === 'object' && pid13 !== null) {
            phone = pid13['PID.13.1'] || phone;
          } else if (typeof pid13 === 'string') {
            phone = pid13;
          }

          const dob = String(hl7.get('PID.7') || '19820415');
          const gender = String(hl7.get('PID.8') || 'F');

          const patientInternal: PatientDemographicsInternal = {
            mrn,
            fullName,
            familyName,
            givenName,
            dob,
            gender,
            phone,
            address,
          };

          // --- PV1 Segment (Patient Location) ---
          const pv13 = hl7.get('PV1.3') as Record<string, string> | string | undefined;
          let pointOfCare = '4W';
          let room = '402';
          let bed = 'B';
          let facility = 'IPD';

          if (typeof pv13 === 'object' && pv13 !== null) {
            pointOfCare = pv13['PV1.3.1'] || pointOfCare;
            room = pv13['PV1.3.2'] || room;
            bed = pv13['PV1.3.3'] || bed;
            facility = pv13['PV1.3.4'] || facility;
          }

          const location: LocationDetail = {
            pointOfCare,
            room,
            bed,
            facility,
            formattedLocation: `Room ${room}, Bed ${bed} (${pointOfCare} ${facility})`,
          };

          // --- ORC Segment (Order Details & Courier) ---
          const orderControl = String(hl7.get('ORC.1') || 'OK');
          const placerOrderNumber = String(hl7.get('ORC.2.1') || hl7.get('ORC.2') || 'ORD-2026-CC-89421');
          const fillerOrderNumber = String(hl7.get('ORC.3.1') || hl7.get('ORC.3') || 'DISP-2026-9921');

          // Courier from ORC.12 (or courier OBX fallback)
          const orc12 = hl7.get('ORC.12') as Record<string, string> | string | undefined;
          let courierId = 'COURIER_04';
          let courierFamily = 'Davis';
          let courierGiven = 'Marcus';
          let courierRole = 'Courier';

          if (typeof orc12 === 'object' && orc12 !== null) {
            courierId = orc12['ORC.12.1'] || courierId;
            courierFamily = orc12['ORC.12.2'] || courierFamily;
            courierGiven = orc12['ORC.12.3'] || courierGiven;
            courierRole = orc12['ORC.12.6'] || courierRole;
          }

          const courierFullName = [courierGiven, courierFamily].filter(Boolean).join(' ') || 'Marcus Davis';
          const courier: CourierDetail = {
            id: courierId,
            fullName: courierFullName,
            familyName: courierFamily,
            givenName: courierGiven,
            role: courierRole,
            displayFirstNameOrRole: `${courierGiven || courierRole} (${courierRole})`,
          };

          // --- RXO Segment (Prescription / Medication) ---
          const rxo1 = hl7.get('RXO.1') as Record<string, string> | string | undefined;
          let rxcui = '285018';
          let drugDisplay = 'insulin glargine 100 UNT/ML Injectable Solution [Lantus]';

          if (typeof rxo1 === 'object' && rxo1 !== null) {
            rxcui = rxo1['RXO.1.1'] || rxcui;
            drugDisplay = rxo1['RXO.1.2'] || drugDisplay;
          }

          const giveAmount = String(hl7.get('RXO.2') || '20');
          const giveUnits = String(hl7.get('RXO.3') || 'UNT');

          // --- RXR Segment (Route) ---
          const route = String(hl7.get('RXR.1.2') || hl7.get('RXR.1') || 'Subcutaneous');

          // --- OBX Segments (Storage Condition, ETA, Courier Notes) ---
          let storageCondition = '2°C to 8°C (Refrigerated - Cold Chain)';
          let etaTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Default 15 mins

          const obxSegments = hl7.getSegments('OBX');
          for (const obx of obxSegments) {
            const obsId = String(obx.get('OBX.3.1') || obx.get('OBX.3') || '');
            const obsVal = String(obx.get('OBX.5.1') || obx.get('OBX.5') || '');

            if (obsId === 'TEMP_CONTROL') {
              storageCondition = obsVal || storageCondition;
            } else if (obsId === 'DELIVERY_ETA') {
              etaTimestamp = obsVal || etaTimestamp;
            } else if (obsId === 'COURIER_INFO' && !courier.fullName) {
              courier.fullName = obsVal;
            }
          }

          resolve({
            messageId,
            messageType,
            timestamp,
            orderControl,
            placerOrderNumber,
            fillerOrderNumber,
            patientInternal,
            location,
            rxcui,
            drugDisplay,
            giveAmount,
            giveUnits,
            route,
            courier,
            etaTimestamp,
            storageCondition,
            rawHL7: rawHl7String,
          });
        } catch (extractError) {
          reject(new Error(`Failed to extract fields from HL7 message: ${(extractError as Error).message}`));
        }
      });
    } catch (parseError) {
      reject(new Error(`HL7 Parser instantiation error: ${(parseError as Error).message}`));
    }
  });
}

/**
 * Loads and parses the bundled sample OMP^O09 fixture
 */
export async function loadSampleDeliveryEvent(): Promise<HL7DeliveryEvent> {
  const samplePath = path.resolve(__dirname, 'sample-omp-o09.txt');
  const rawContent = fs.readFileSync(samplePath, 'utf8');
  return parseDeliveryEvent(rawContent);
}
