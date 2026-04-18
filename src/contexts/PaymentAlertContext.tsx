import { createContext, useContext, ReactNode } from "react";

interface PaymentAlertContextType {
  showPaymentAlert: boolean;
  diasOverdue: number;
  isCorporate: boolean;
}

const PaymentAlertContext = createContext<PaymentAlertContextType>({
  showPaymentAlert: false,
  diasOverdue: 0,
  isCorporate: false,
});

export const usePaymentAlert = () => useContext(PaymentAlertContext);

interface PaymentAlertProviderProps {
  children: ReactNode;
  value: PaymentAlertContextType;
}

export const PaymentAlertProvider = ({ children, value }: PaymentAlertProviderProps) => (
  <PaymentAlertContext.Provider value={value}>
    {children}
  </PaymentAlertContext.Provider>
);
