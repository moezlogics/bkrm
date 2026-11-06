import React from "react";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import CmsPage from "@/models/CmsPage";
import { getBaseUrl } from "@/lib/seo";

const getPage = cache(async function getPage(slug: string) {
  await dbConnect();
  const page = await CmsPage.findOne({ slug, status: true }).lean();
  return page ? JSON.parse(JSON.stringify(page)) : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: "Page not found" };
  const base = getBaseUrl();
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || undefined,
    alternates: { canonical: `${base}/page/${page.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <div className="container mx-auto px-4 py-10 pb-mobile-nav max-w-3xl">
      <h1 className="text-3xl font-bold text-content mb-6">{page.title}</h1>
      {page.content ? (
        <div
          className="prose prose-sm md:prose-base max-w-none text-content-secondary leading-relaxed [&_h2]:text-content [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      ) : (
        <p className="text-content-secondary">Is page ka content abhi available nahi.</p>
      )}
    </div>
  );
}
