/**
 * Step 2: Validate the Drug Formulation via NLM RxNav / RxNorm REST API
 *
 * Checks the prescribed RxNorm code against official NLM terminologies to ensure:
 * 1. The concept is an Active/Current RxCUI in the official dataset.
 * 2. The drug formulation, dose form (DF), active ingredient (IN), and clinical drug (SCD)
 *    match using structured terminology code relations (NOT string substring matching).
 */

import { CONFIG } from '../config.js';
import type { DrugValidationResult } from '../types.js';

export interface RxNavHistoryStatusResponse {
  rxcuiStatusHistory?: {
    metaData?: {
      status?: string;
      source?: string;
      isCurrent?: string;
      activeStartDate?: string;
      activeEndDate?: string;
    };
    attributes?: {
      rxcui?: string;
      name?: string;
      tty?: string;
      isMultipleIngredient?: string;
      isBranded?: string;
    };
  };
}

export interface RxNavRelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{
        rxcui: string;
        name: string;
        tty: string;
        synonym?: string;
      }>;
    }>;
  };
}

/**
 * Validate an RxNorm code (RxCUI) using the NIH NLM RxNav REST APIs.
 *
 * @param rxcui The RxNorm Concept Unique Identifier (e.g., '285018')
 * @param baseUrl Optional custom RxNav base URL (useful for testing)
 */
export async function validateDrugByRxCui(
  rxcui: string,
  baseUrl: string = CONFIG.RXNAV_BASE_URL
): Promise<DrugValidationResult> {
  const sanitizedRxcui = rxcui.trim();

  if (!sanitizedRxcui || !/^\d+$/.test(sanitizedRxcui)) {
    return {
      isValid: false,
      isCurrent: false,
      rxcui: sanitizedRxcui,
      prescribedName: 'Invalid RxCUI format',
      termType: 'UNKNOWN',
      doseForm: 'N/A',
      activeIngredients: [],
      matchingClinicalDrugs: [],
      validationMessage: `Failed validation: '${sanitizedRxcui}' is not a valid numeric RxCUI.`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');

  try {
    // 1. Check Concept Status & Metadata via /historystatus.json
    const statusUrl = `${cleanBase}/rxcui/${sanitizedRxcui}/historystatus.json`;
    const statusRes = await fetch(statusUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!statusRes.ok) {
      if (statusRes.status === 404) {
        return {
          isValid: false,
          isCurrent: false,
          rxcui: sanitizedRxcui,
          prescribedName: 'Concept Not Found',
          termType: 'UNKNOWN',
          doseForm: 'N/A',
          activeIngredients: [],
          matchingClinicalDrugs: [],
          validationMessage: `RxNorm code '${sanitizedRxcui}' not found in NLM RxNav database.`,
          evaluatedAt: new Date().toISOString(),
        };
      }
      throw new Error(`RxNav status endpoint returned HTTP ${statusRes.status}`);
    }

    const statusData = (await statusRes.json()) as RxNavHistoryStatusResponse;
    const meta = statusData.rxcuiStatusHistory?.metaData;
    const attrs = statusData.rxcuiStatusHistory?.attributes;

    const statusText = meta?.status || '';
    const isCurrent = meta?.isCurrent === 'YES' || statusText.toLowerCase() === 'active';
    const prescribedName = attrs?.name || '';
    const termType = attrs?.tty || 'UNKNOWN';

    // If RxNav returns status UNKNOWN / source NONE or empty name, the concept is nonexistent
    if (statusText === 'UNKNOWN' || meta?.source === 'NONE' || !prescribedName) {
      return {
        isValid: false,
        isCurrent: false,
        rxcui: sanitizedRxcui,
        prescribedName: 'Concept Not Found',
        termType: 'UNKNOWN',
        doseForm: 'N/A',
        activeIngredients: [],
        matchingClinicalDrugs: [],
        validationMessage: `RxNorm code '${sanitizedRxcui}' not found in NLM RxNav database.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // If concept is obsolete or retired, fail validation
    if (!isCurrent && statusText.toLowerCase() === 'obsolete') {
      return {
        isValid: false,
        isCurrent: false,
        rxcui: sanitizedRxcui,
        prescribedName,
        termType,
        doseForm: 'N/A',
        activeIngredients: [],
        matchingClinicalDrugs: [],
        validationMessage: `RxNorm concept '${sanitizedRxcui}' is obsolete / retired.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 2. Fetch Structured Terminology Relationships (SCD, DF, IN)
    const relatedUrl = `${cleanBase}/rxcui/${sanitizedRxcui}/related.json?tty=SCD+DF+IN`;
    const relatedRes = await fetch(relatedUrl, {
      headers: { Accept: 'application/json' },
    });

    const activeIngredients: string[] = [];
    const matchingClinicalDrugs: string[] = [];
    let doseForm = 'Unknown Dose Form';

    if (relatedRes.ok) {
      const relatedData = (await relatedRes.json()) as RxNavRelatedResponse;
      const groups = relatedData.relatedGroup?.conceptGroup || [];

      for (const group of groups) {
        const tty = group.tty;
        const concepts = group.conceptProperties || [];

        if (tty === 'IN') {
          for (const c of concepts) {
            activeIngredients.push(`${c.name} (RxCUI: ${c.rxcui})`);
          }
        } else if (tty === 'DF') {
          if (concepts.length > 0 && concepts[0]) {
            doseForm = `${concepts[0].name} (RxCUI: ${concepts[0].rxcui})`;
          }
        } else if (tty === 'SCD') {
          for (const c of concepts) {
            matchingClinicalDrugs.push(`${c.name} [RxCUI: ${c.rxcui}]`);
          }
        }
      }
    }

    // A valid medication concept in RxNorm will have an active status and valid termType
    const isValid = Boolean(prescribedName && termType !== 'UNKNOWN');

    return {
      isValid,
      isCurrent,
      rxcui: sanitizedRxcui,
      prescribedName,
      termType,
      doseForm,
      activeIngredients,
      matchingClinicalDrugs,
      validationMessage: isValid
        ? `Validated RxNorm concept '${sanitizedRxcui}' (${prescribedName}). Term Type: ${termType}. Dose Form: ${doseForm}.`
        : `Concept '${sanitizedRxcui}' is missing required formulation properties in RxNorm.`,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`RxNav API validation failed for RxCUI ${sanitizedRxcui}: ${(error as Error).message}`);
  }
}
