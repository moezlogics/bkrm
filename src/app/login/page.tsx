import React from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in", robots: { index: false, follow: true } };

export default function LoginPage() {
  return <LoginForm />;
}
