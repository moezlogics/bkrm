import React from "react";
import type { Metadata } from "next";
import dbConnect from "@/lib/mongodb";
import Faq from "@/models/Faq";
import { JsonLd } from "@/components/JsonLd";
import { getBaseUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Frequently Asked Questions",
    description: "Common questions about buying and selling safely.",
    alternates: { canonical: `${getBaseUrl()}/faq` },
    robots: { index: true, follow: true },
  };
}

async function getFaqs() {
  try {
    await dbConnect();
    const faqs = await Faq.find({ status: true }).sort({ sequence: 1 }).lean();
    return JSON.parse(JSON.stringify(faqs));
  } catch {
    return [];
  }
}

export default async function FaqPage() {
  const faqs = await getFaqs();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f: any) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="container mx-auto px-4 py-10 pb-mobile-nav max-w-3xl">
      {faqs.length > 0 && <JsonLd data={faqJsonLd} />}
      <h1 className="text-3xl font-bold text-content mb-6">Frequently Asked Questions</h1>
      {faqs.length > 0 ? (
        <div className="flex flex-col gap-3">
          {faqs.map((f: any) => (
            <details key={f._id} className="group bg-card border border-card-border rounded-2xl p-5">
              <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-content text-sm">
                {f.question}
                <span className="text-content-tertiary group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-content-secondary leading-relaxed whitespace-pre-line">{f.answer}</p>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-content-secondary">Abhi koi FAQ available nahi.</p>
      )}
    </div>
  );
}
