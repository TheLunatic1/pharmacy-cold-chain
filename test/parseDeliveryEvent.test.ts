import { describe, expect, it } from 'vitest';
import {
  loadSampleDeliveryEvent,
  parseDeliveryEvent,
} from '../src/hl7v2/parseDeliveryEvent.js';

describe('Step 3: HL7 v2 OMP^O09 Delivery Event Parser', () => {
  it('should correctly parse the bundled sample OMP^O09 message fixture', async () => {
    const event = await loadSampleDeliveryEvent();

    expect(event).toBeDefined();
    expect(event.messageType).toContain('OMP^O09');
    expect(event.messageId).toBe('MSG20260917001');

    // Patient Demographics (Internal)
    expect(event.patientInternal.mrn).toBe('MRN89124');
    expect(event.patientInternal.fullName).toBe('Eleanor Vance');
    expect(event.patientInternal.dob).toBe('19820415');
    expect(event.patientInternal.phone).toBe('(555)234-5678');

    // Location
    expect(event.location.pointOfCare).toBe('4W');
    expect(event.location.room).toBe('402');
    expect(event.location.bed).toBe('B');
    expect(event.location.facility).toBe('IPD');
    expect(event.location.formattedLocation).toBe('Room 402, Bed B (4W IPD)');

    // Order Details
    expect(event.orderControl).toBe('OK');
    expect(event.placerOrderNumber).toBe('ORD-2026-CC-89421');
    expect(event.fillerOrderNumber).toBe('DISP-2026-9921');

    // Courier Assignment
    expect(event.courier.id).toBe('COURIER_04');
    expect(event.courier.fullName).toBe('Marcus Davis');
    expect(event.courier.givenName).toBe('Marcus');
    expect(event.courier.role).toBe('Courier');

    // Medication & Cold-Chain Storage
    expect(event.rxcui).toBe('285018');
    expect(event.drugDisplay).toContain('insulin glargine');
    expect(event.giveAmount).toBe('20');
    expect(event.giveUnits).toBe('UNT');
    expect(event.storageCondition).toContain('2-8 C');
    expect(event.etaTimestamp).toBe('2026-09-17T19:50:00Z');
  });

  it('should parse custom OMP^O09 message with different patient and courier', async () => {
    const customHl7 = [
      'MSH|^~\\&|PHARM|HOSP|NURSE|FLOOR5|20260917200000||OMP^O09|MSG998811|P|2.5.1',
      'PID|1||MRN55123^^^HOSP||Doe^Jane^^^Dr.||19750820|F|||500 Health Ave^^Boston^MA^02115||(555)999-0000',
      'PV1|1|I|5E^510^A^IPD',
      'ORC|OK|ORD-9901|DISP-9902|||||20260917200000||||COURIER_09^Taylor^Sarah^^^Courier',
      'RXO|311041^insulin glargine 100 UNT/ML Injectable Solution^RXNORM|15|UNT',
      'RXR|SC^Subcutaneous',
      'OBX|1|TX|DELIVERY_ETA||2026-09-17T20:25:00Z||||||F',
      'OBX|2|ST|TEMP_CONTROL||Keep Refrigerated 2-8C||||||F',
    ].join('\r');

    const event = await parseDeliveryEvent(customHl7);

    expect(event.patientInternal.fullName).toBe('Jane Doe');
    expect(event.patientInternal.mrn).toBe('MRN55123');
    expect(event.location.room).toBe('510');
    expect(event.location.bed).toBe('A');
    expect(event.courier.fullName).toBe('Sarah Taylor');
    expect(event.etaTimestamp).toBe('2026-09-17T20:25:00Z');
    expect(event.storageCondition).toBe('Keep Refrigerated 2-8C');
  });

  it('should reject empty or malformed HL7 strings with descriptive errors', async () => {
    await expect(parseDeliveryEvent('')).rejects.toThrow('Empty or invalid HL7 v2 message');
    await expect(parseDeliveryEvent('   ')).rejects.toThrow('Empty or invalid HL7 v2 message');
  });
});
