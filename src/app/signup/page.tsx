import React from "react";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account", robots: { index: false, follow: true } };

export default function SignupPage() {
  return <SignupForm />;
}
