export type Designation = "Owner" | "Manager" | "Cashier" | "Pharmacist" | "Store Keeper" | "Accountant";

export interface Staff {
  id: string;
  name: string;
  designation: Designation;
  mobile: string;
  email: string;
  nid: string;
  joined: string;
  salary: number;
  status: "Active" | "Suspended" | "On Leave";
  shift: "Morning" | "Evening" | "Night";
}

export const staff: Staff[] = [
  { id: "EMP-001", name: "Tania Akter", designation: "Owner", mobile: "01711-000001", email: "tania@sohojpharma.cloud", nid: "1990xxxxx", joined: "2022-01-10", salary: 0, status: "Active", shift: "Morning" },
  { id: "EMP-002", name: "Karim Hossain", designation: "Manager", mobile: "01711-000002", email: "karim@sohojpharma.cloud", nid: "1988xxxxx", joined: "2022-03-15", salary: 45000, status: "Active", shift: "Morning" },
  { id: "EMP-003", name: "Sumon Ahmed", designation: "Cashier", mobile: "01711-000003", email: "sumon@sohojpharma.cloud", nid: "1996xxxxx", joined: "2023-05-22", salary: 22000, status: "Active", shift: "Evening" },
  { id: "EMP-004", name: "Rina Khatun", designation: "Pharmacist", mobile: "01711-000004", email: "rina@sohojpharma.cloud", nid: "1994xxxxx", joined: "2023-07-01", salary: 32000, status: "Active", shift: "Morning" },
  { id: "EMP-005", name: "Joshim Ali", designation: "Store Keeper", mobile: "01711-000005", email: "joshim@sohojpharma.cloud", nid: "1985xxxxx", joined: "2022-09-10", salary: 18000, status: "On Leave", shift: "Night" },
  { id: "EMP-006", name: "Maliha Noor", designation: "Accountant", mobile: "01711-000006", email: "maliha@sohojpharma.cloud", nid: "1992xxxxx", joined: "2024-02-01", salary: 35000, status: "Active", shift: "Morning" },
];

export const designations: Designation[] = ["Owner", "Manager", "Cashier", "Pharmacist", "Store Keeper", "Accountant"];
