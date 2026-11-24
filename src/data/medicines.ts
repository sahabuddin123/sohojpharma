// Bangladesh pharmacy medicine master sample dataset.
// Used by the medicine search modal for autofill while creating products.

export type DosageForm =
  | "Tablet"
  | "Capsule"
  | "Syrup"
  | "Injection"
  | "Cream"
  | "Ointment"
  | "Drops"
  | "Medical Device"
  | "Surgical Item"
  | "Others";

export interface MedicineMaster {
  id: string;
  brand: string;
  generic: string;
  manufacturer: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  unit: string;
  category: string;
}

export const MEDICINE_CATEGORIES: DosageForm[] = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Cream",
  "Ointment",
  "Drops",
  "Medical Device",
  "Surgical Item",
  "Others",
];

export const MEDICINE_MASTER: MedicineMaster[] = [
  { id: "m-001", brand: "Napa Extra", generic: "Paracetamol + Caffeine", manufacturer: "Beximco Pharma", strength: "500 mg + 65 mg", dosageForm: "Tablet", packSize: "10x10", unit: "pcs", category: "Analgesic" },
  { id: "m-002", brand: "Napa", generic: "Paracetamol", manufacturer: "Beximco Pharma", strength: "500 mg", dosageForm: "Tablet", packSize: "20x10", unit: "pcs", category: "Analgesic" },
  { id: "m-003", brand: "Sergel", generic: "Esomeprazole", manufacturer: "Healthcare Pharma", strength: "20 mg", dosageForm: "Capsule", packSize: "5x10", unit: "pcs", category: "Gastric" },
  { id: "m-004", brand: "Monas", generic: "Montelukast Sodium", manufacturer: "ACME Laboratories", strength: "10 mg", dosageForm: "Tablet", packSize: "3x10", unit: "pcs", category: "Respiratory" },
  { id: "m-005", brand: "Calbo D", generic: "Calcium + Vit D3", manufacturer: "Square Pharma", strength: "500 mg + 200 IU", dosageForm: "Tablet", packSize: "5x10", unit: "pcs", category: "Vitamin" },
  { id: "m-006", brand: "Maxpro", generic: "Esomeprazole", manufacturer: "Renata Limited", strength: "20 mg", dosageForm: "Capsule", packSize: "3x10", unit: "pcs", category: "Gastric" },
  { id: "m-007", brand: "Seclo", generic: "Omeprazole", manufacturer: "Square Pharma", strength: "20 mg", dosageForm: "Capsule", packSize: "10x10", unit: "pcs", category: "Gastric" },
  { id: "m-008", brand: "Ace", generic: "Paracetamol", manufacturer: "Square Pharma", strength: "500 mg", dosageForm: "Tablet", packSize: "20x10", unit: "pcs", category: "Analgesic" },
  { id: "m-009", brand: "Fexo", generic: "Fexofenadine HCl", manufacturer: "Square Pharma", strength: "120 mg", dosageForm: "Tablet", packSize: "3x10", unit: "pcs", category: "Antihistamine" },
  { id: "m-010", brand: "Cef-3", generic: "Cefixime", manufacturer: "Square Pharma", strength: "200 mg", dosageForm: "Capsule", packSize: "1x6", unit: "pcs", category: "Antibiotic" },
  { id: "m-011", brand: "Azith", generic: "Azithromycin", manufacturer: "Opsonin Pharma", strength: "500 mg", dosageForm: "Tablet", packSize: "1x3", unit: "pcs", category: "Antibiotic" },
  { id: "m-012", brand: "Insulin Mixtard 30/70", generic: "Human Insulin", manufacturer: "Novo Nordisk", strength: "100 IU/ml", dosageForm: "Injection", packSize: "10 ml vial", unit: "vial", category: "Diabetic" },
  { id: "m-013", brand: "Comfit Condom", generic: "Latex Condom", manufacturer: "SMC", strength: "-", dosageForm: "Medical Device", packSize: "3 pcs", unit: "pack", category: "Contraceptive" },
  { id: "m-014", brand: "Pevisone", generic: "Triamcinolone + Econazole", manufacturer: "Janssen", strength: "10 g", dosageForm: "Cream", packSize: "10 g tube", unit: "tube", category: "Dermatology" },
  { id: "m-015", brand: "Tobrex", generic: "Tobramycin", manufacturer: "Alcon", strength: "0.3%", dosageForm: "Drops", packSize: "5 ml", unit: "bottle", category: "Ophthalmic" },
];
