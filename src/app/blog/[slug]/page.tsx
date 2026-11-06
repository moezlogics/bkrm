import React from "react";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { JsonLd } from "@/components/JsonLd";
import { getBaseUrl, breadcrumbJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const getPost = cache(async function getPost(slug: string) {
  await dbConnect();
  const post = await BlogPost.findOne({ slug, status: "published" }).lean();
  return post ? JSON.parse(JSON.stringify(post)) : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };
  const base = getBaseUrl();
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || undefined,
    alternates: { canonical: `${base}/blog/${post.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt || undefined,
      images: post.coverImage ? [post.coverImage] : undefined,
      url: `${base}/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const base = getBaseUrl();

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    image: post.coverImage ? [post.coverImage] : undefined,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt,
    articleSection: post.category,
  };
  const crumbs = [
    { name: "Home", url: base },
    { name: "Blog", url: `${base}/blog` },
    { name: post.title, url: `${base}/blog/${post.slug}` },
  ];

  return (
    <div className="container mx-auto px-4 py-10 pb-mobile-nav max-w-3xl">
      <JsonLd data={[articleLd, breadcrumbJsonLd(crumbs)]} />
      <nav className="flex items-center gap-2 text-xs text-content-secondary mb-5">
        <Link href="/" className="hover:text-primary">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/blog" className="hover:text-primary">Blog</Link>
      </nav>

      <span className="text-[12px] font-bold uppercase tracking-wider text-primary">{post.category}</span>
      <h1 className="text-3xl font-bold text-content mt-1 mb-2">{post.title}</h1>
      <p className="text-xs text-content-tertiary mb-6">{post.publishedAt ? formatDate(post.publishedAt) : ""}</p>

      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="w-full rounded-2xl border border-card-border mb-6" />
      )}

      <div
        className="prose prose-sm md:prose-base max-w-none text-content-secondary leading-relaxed [&_h2]:text-content [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </div>
  );
}
