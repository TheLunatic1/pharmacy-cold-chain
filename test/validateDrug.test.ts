import { describe, expect, it } from 'vitest';
import { validateDrugByRxCui } from '../src/rxnorm/validateDrug.js';

describe('Step 2: RxNorm / RxNav Drug Validation Engine', () => {
  it('should validate an active RxCUI (285018 - Lantus / Insulin Glargine) against NLM RxNav', async () => {
    const result = await validateDrugByRxCui('285018');

    expect(result.isValid).toBe(true);
    expect(result.isCurrent).toBe(true);
    expect(result.rxcui).toBe('285018');
    expect(result.termType).toBe('SBD');
    expect(result.doseForm).toContain('Injectable Solution');
    expect(result.activeIngredients.some((i) => i.toLowerCase().includes('insulin glargine'))).toBe(true);
    expect(result.matchingClinicalDrugs.length).toBeGreaterThan(0);
  });

  it('should validate clinical formulation RxCUI (311041 - Insulin Glargine 100 UNT/ML Solution)', async () => {
    const result = await validateDrugByRxCui('311041');

    expect(result.isValid).toBe(true);
    expect(result.rxcui).toBe('311041');
    expect(result.termType).toBe('SCD');
    expect(result.doseForm).toContain('Injectable Solution');
  });

  it('should reject invalid non-numeric RxCUI strings without throwing network errors', async () => {
    const result = await validateDrugByRxCui('INVALID_CODE_XYZ');

    expect(result.isValid).toBe(false);
    expect(result.isCurrent).toBe(false);
    expect(result.validationMessage).toContain('not a valid numeric RxCUI');
  });

  it('should handle non-existent numeric RxCUI gracefully', async () => {
    // 99999999 is an unassigned concept ID in RxNorm
    const result = await validateDrugByRxCui('99999999');

    expect(result.isValid).toBe(false);
    expect(result.isCurrent).toBe(false);
    expect(result.validationMessage).toContain('not found in NLM RxNav');
  });
});
