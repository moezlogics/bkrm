import React from "react";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Reset password", robots: { index: false, follow: true } };

export default function ForgotPasswordPage() {
  return <ResetForm />;
}
