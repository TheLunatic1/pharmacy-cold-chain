import { describe, expect, it } from 'vitest';
import { loadSampleDeliveryEvent } from '../src/hl7v2/parseDeliveryEvent.js';
import {
  assertNoPhiInAlert,
  buildNurseAlertPayload,
} from '../src/notify/buildNurseAlert.js';
import type { HL7DeliveryEvent, NurseAlertPayload } from '../src/types.js';

describe('Step 5a: HIPAA Compliance & PHI-Stripped Nurse Alert Builder', () => {
  it('should include strictly allowed operational delivery fields', async () => {
    const event = await loadSampleDeliveryEvent();
    const payload = buildNurseAlertPayload({ event });

    expect(payload.alertType).toBe('COLD_CHAIN_MEDICATION_IN_TRANSIT');
    expect(payload.destinationRoom).toBe('402');
    expect(payload.destinationBed).toBe('B');
    expect(payload.destinationDisplay).toContain('Room 402, Bed B');
    expect(payload.medication).toContain('insulin glargine');
    expect(payload.courier).toBe('Marcus (Courier)');
    expect(payload.estimatedArrival).toBe('2026-09-17T19:50:00Z');
    expect(payload.coldChainNotice).toContain('2-8 C');
    expect(payload.dispatchedAt).toBeDefined();
  });

  it('should strictly exclude all Patient Identifying Information (PHI)', async () => {
    const event = await loadSampleDeliveryEvent();
    const payload = buildNurseAlertPayload({ event });
    const serialized = JSON.stringify(payload).toLowerCase();

    // 1. Patient Name must NOT exist in the alert
    expect(serialized).not.toContain('eleanor');
    expect(serialized).not.toContain('vance');

    // 2. Medical Record Number (MRN) must NOT exist
    expect(serialized).not.toContain('mrn89124');
    expect(serialized).not.toContain('89124');

    // 3. Date of Birth must NOT exist
    expect(serialized).not.toContain('19820415');
    expect(serialized).not.toContain('1982-04-15');

    // 4. Contact info must NOT exist
    expect(serialized).not.toContain('555');
    expect(serialized).not.toContain('234-5678');
    expect(serialized).not.toContain('elm street');
    expect(serialized).not.toContain('boston');
  });

  it('should pass assertNoPhiInAlert validation on sanitized payload', async () => {
    const event = await loadSampleDeliveryEvent();
    const payload = buildNurseAlertPayload({ event });

    expect(() => assertNoPhiInAlert(payload, event)).not.toThrow();
    expect(assertNoPhiInAlert(payload, event)).toBe(true);
  });

  it('should throw an error if PHI is maliciously or accidentally injected into the alert payload', async () => {
    const event = await loadSampleDeliveryEvent();
    const payload = buildNurseAlertPayload({ event });

    // Simulate accidental leak of patient surname into medication or courier display
    const leakedPayload: NurseAlertPayload = {
      ...payload,
      medication: `Lantus for Vance`, // Leaked patient surname
    };

    expect(() => assertNoPhiInAlert(leakedPayload, event)).toThrow(
      /HIPAA VIOLATION DETECTED/
    );
  });
});
