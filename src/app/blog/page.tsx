import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { getBaseUrl } from "@/lib/seo";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog — Tips & Guides",
    description: "Buying & selling guides, price tips, and safety advice.",
    alternates: { canonical: `${getBaseUrl()}/blog` },
    robots: { index: true, follow: true },
  };
}

async function getPosts() {
  try {
    await dbConnect();
    const posts = await BlogPost.find({ status: "published" }).sort({ publishedAt: -1 }).lean();
    return JSON.parse(JSON.stringify(posts));
  } catch {
    return [];
  }
}

export default async function BlogIndex() {
  const posts = await getPosts();

  return (
    <div className="container mx-auto px-4 py-10 pb-mobile-nav max-w-5xl">
      <h1 className="text-3xl font-bold text-content mb-6">Blog</h1>
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((p: any) => (
            <Link key={p._id} href={`/blog/${p.slug}`}
              className="group bg-card border border-card-border rounded-2xl overflow-hidden hover:shadow-md transition-all">
              <div className="aspect-[16/9] bg-zinc-100 overflow-hidden">
                {p.coverImage ? (
                  <img src={p.coverImage} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10" />
                )}
              </div>
              <div className="p-4 flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{p.category}</span>
                <h2 className="font-bold text-content text-base line-clamp-2 group-hover:text-primary transition-colors">{p.title}</h2>
                {p.excerpt && <p className="text-xs text-content-secondary line-clamp-2">{p.excerpt}</p>}
                <span className="text-[12px] text-content-tertiary mt-1">{p.publishedAt ? formatDate(p.publishedAt) : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-content-secondary">Abhi koi blog post nahi.</p>
      )}
    </div>
  );
}
