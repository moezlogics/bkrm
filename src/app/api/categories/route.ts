import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category, { ICategory } from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

// Helper to construct a hierarchical category tree
function buildCategoryTree(categories: ICategory[], parentId: string | null = null): any[] {
  const nodeIds = categories.map(c => c._id.toString());
  
  return categories
    .filter((cat) => {
      if (parentId === null) {
        // If searching for root, match null OR matches where the parent is not in the categories list (orphans act as roots)
        return !cat.parentCategoryId || !nodeIds.includes(cat.parentCategoryId.toString());
      }
      return cat.parentCategoryId?.toString() === parentId;
    })
    .map((cat: any) => ({
      _id: cat._id,
      name: cat.name,
      slug: cat.slug,
      image: cat.image,
      icon: cat.icon,
      sequence: cat.sequence,
      parentCategoryId: cat.parentCategoryId,
      description: cat.description,
      status: cat.status,
      // per-category config (drives the post wizard / filters)
      listingType: cat.listingType || "item",
      priceMode: cat.priceMode || "fixed",
      conditionSet: cat.conditionSet || [],
      showCondition: cat.showCondition !== false,
      children: buildCategoryTree(categories, cat._id.toString()),
    }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tree = searchParams.get("tree") !== "false"; // default to tree structure
    const statusOnly = searchParams.get("activeOnly") === "true"; // filter active ones

    await dbConnect();

    const query: any = {};
    if (statusOnly) {
      query.status = true;
    }

    const categories = await Category.find(query).sort({ sequence: 1 }).lean();

    if (tree) {
      const categoryTree = buildCategoryTree(categories as unknown as ICategory[]);
      return NextResponse.json({ success: true, data: categoryTree });
    }

    return NextResponse.json({ success: true, data: categories });
  } catch (error: any) {
    console.error("GET Categories Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin session
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const {
      name,
      image,
      icon,
      parentCategoryId,
      description,
      sequence,
      status,
      // per-category config
      listingType,
      priceMode,
      conditionSet,
      showCondition,
      urlFacetKeys,
      indexableArea,
      freeAdQuota,
      // SEO
      seoTitle,
      seoDescription,
      content,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Generate unique slug
    let baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    while (await Category.findOne({ slug })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }

    // 3. Build payload (only include config fields when provided so model
    //    defaults apply otherwise).
    const payload: any = {
      name: name.trim(),
      slug,
      image: image ? image.trim() : null,
      icon: icon ? icon.trim() : null,
      parentCategoryId: parentCategoryId ? parentCategoryId : null,
      description: description ? description.trim() : "",
      sequence: sequence !== undefined ? Number(sequence) : 0,
      status: status !== undefined ? Boolean(status) : true,
    };

    if (listingType !== undefined) payload.listingType = listingType;
    if (priceMode !== undefined) payload.priceMode = priceMode;
    if (conditionSet !== undefined) {
      payload.conditionSet = Array.isArray(conditionSet)
        ? conditionSet.map((c: string) => c.trim()).filter(Boolean)
        : [];
    }
    if (showCondition !== undefined) payload.showCondition = Boolean(showCondition);
    if (urlFacetKeys !== undefined) {
      payload.urlFacetKeys = Array.isArray(urlFacetKeys)
        ? urlFacetKeys.map((k: string) => k.trim()).filter(Boolean)
        : [];
    }
    if (indexableArea !== undefined) payload.indexableArea = Boolean(indexableArea);
    if (freeAdQuota !== undefined)
      payload.freeAdQuota =
        freeAdQuota === null || freeAdQuota === "" ? null : Number(freeAdQuota);
    if (seoTitle !== undefined) payload.seoTitle = seoTitle ? seoTitle.trim() : null;
    if (seoDescription !== undefined)
      payload.seoDescription = seoDescription ? seoDescription.trim() : null;
    if (content !== undefined) payload.content = content ? content : null;

    // 4. Create category
    const newCategory = await Category.create(payload);

    expireTag("categories");

    return NextResponse.json({ success: true,
      message: "Category created successfully",
      data: newCategory,
    });
  } catch (error: any) {
    console.error("POST Category Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create category" },
      { status: 500 }
    );
  }
}
