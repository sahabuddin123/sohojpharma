import { CustomerFormDialog } from "./customer-form-dialog";

type Props = {
  customerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
};

export function EditCustomerDialog(props: Props) {
  return <CustomerFormDialog mode="edit" {...props} />;
}
