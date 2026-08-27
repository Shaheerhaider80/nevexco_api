/**
 * Category tree derivation.
 *
 * Novexco has no categories endpoint. Each product carries its own leaf category
 * (code + EN/FR name), and the code itself encodes the hierarchy:
 *
 *   NP2703D  ->  department "NP" + family "27" + leaf "03" + suffix "D"
 *
 * Only the leaf is named by the API. Department names below are supplied here
 * because they exist nowhere in the vendor data.
 */

import type { CategoryRef } from './novexco-adapter';

/**
 * Department labels are our own, inferred from the leaf categories that sit
 * under each code - adjust freely, nothing downstream depends on the wording.
 * A code with no entry here falls back to showing the raw code, so an
 * unexpected department surfaces rather than breaking navigation.
 */
export const DEPARTMENT_NAMES: Record<string, string> = {
  NA: 'Paint & Hardware',
  NB: 'Breakroom & Appliances',
  NE: 'Writing Instruments',
  NF: 'Printer Supplies',
  NG: 'Photo & Display',
  NH: 'Safety & Protection',
  NI: 'Technology & Electronics',
  NJ: 'Cleaning & Facilities',
  NM: 'Furniture & Seating',
  NP: 'Office Supplies',
  NQ: 'Business Machines',
  NR: 'Paper & Pads',
  NW: 'Envelopes & Mailing',
};

export function departmentOf(code: string): string {
  return code.slice(0, 2);
}

export function familyOf(code: string): string {
  return code.slice(0, 4);
}

export function departmentName(dept: string): string {
  return DEPARTMENT_NAMES[dept] ?? dept;
}

export interface LeafNode {
  code: string;
  name: string;
  nameFr: string;
  productCount: number;
}

export interface FamilyNode {
  code: string;
  /** Families are unnamed in the source; we show the code plus a leaf sample. */
  label: string;
  leaves: LeafNode[];
  productCount: number;
}

export interface DepartmentNode {
  code: string;
  name: string;
  families: FamilyNode[];
  productCount: number;
}

/**
 * Build the three-level tree from the flat category list discovered so far.
 * `counts` maps a leaf category code to how many synced products carry it.
 */
export function buildTree(
  categories: CategoryRef[],
  counts: Record<string, number> = {}
): DepartmentNode[] {
  const departments = new Map<string, Map<string, LeafNode[]>>();

  for (const category of categories) {
    if (!category.code) continue;
    const dept = departmentOf(category.code);
    const family = familyOf(category.code);

    if (!departments.has(dept)) departments.set(dept, new Map());
    const families = departments.get(dept)!;
    if (!families.has(family)) families.set(family, []);

    families.get(family)!.push({
      code: category.code,
      name: category.nameEn || category.code,
      nameFr: category.nameFr,
      productCount: counts[category.code] ?? 0,
    });
  }

  const tree: DepartmentNode[] = [];

  for (const [deptCode, familyMap] of departments) {
    const families: FamilyNode[] = [];

    for (const [familyCode, leaves] of familyMap) {
      leaves.sort((a, b) => a.name.localeCompare(b.name));
      families.push({
        code: familyCode,
        // No family names exist in the data, so lead with the largest leaf.
        label: leaves.length === 1 ? leaves[0].name : `${leaves[0].name} & more`,
        leaves,
        productCount: leaves.reduce((sum, leaf) => sum + leaf.productCount, 0),
      });
    }

    families.sort((a, b) => a.code.localeCompare(b.code));

    tree.push({
      code: deptCode,
      name: departmentName(deptCode),
      families,
      productCount: families.reduce((sum, family) => sum + family.productCount, 0),
    });
  }

  tree.sort((a, b) => a.name.localeCompare(b.name));
  return tree;
}
