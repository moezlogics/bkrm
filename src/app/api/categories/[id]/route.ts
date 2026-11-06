import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 1. Verify admin
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

    await dbConnect();

    const category = await Category.findById(id);
    if (!category) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 }
      );
    }

    // Update fields (re-slug only when the name actually changes)
    if (name && name.trim() !== category.name) {
      category.name = name.trim();
      let baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 0;
      while (await Category.findOne({ slug, _id: { $ne: id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      category.slug = slug;
    }

    if (image !== undefined) category.image = image ? image.trim() : null;
    if (icon !== undefined) category.icon = icon ? icon.trim() : null;
    if (parentCategoryId !== undefined) {
      // Avoid circular reference (can't make itself or its descendant the parent)
      if (parentCategoryId === id) {
        return NextResponse.json(
          { success: false, message: "A category cannot be its own parent" },
          { status: 400 }
        );
      }
      category.parentCategoryId = parentCategoryId ? parentCategoryId : null;
    }
    if (description !== undefined) category.description = description ? description.trim() : "";
    if (sequence !== undefined) category.sequence = Number(sequence);
    if (status !== undefined) category.status = Boolean(status);

    // ── Per-category config ──
    if (listingType !== undefined) category.listingType = listingType;
    if (priceMode !== undefined) category.priceMode = priceMode;
    if (conditionSet !== undefined) {
      category.conditionSet = Array.isArray(conditionSet)
        ? conditionSet.map((c: string) => c.trim()).filter(Boolean)
        : [];
    }
    if (showCondition !== undefined) category.showCondition = Boolean(showCondition);
    if (urlFacetKeys !== undefined) {
      category.urlFacetKeys = Array.isArray(urlFacetKeys)
        ? urlFacetKeys.map((k: string) => k.trim()).filter(Boolean)
        : [];
    }
    if (indexableArea !== undefined) category.indexableArea = Boolean(indexableArea);
    if (freeAdQuota !== undefined)
      category.freeAdQuota =
        freeAdQuota === null || freeAdQuota === "" ? null : Number(freeAdQuota);

    // ── SEO ──
    if (seoTitle !== undefined) category.seoTitle = seoTitle ? seoTitle.trim() : null;
    if (seoDescription !== undefined)
      category.seoDescription = seoDescription ? seoDescription.trim() : null;
    if (content !== undefined) category.content = content ? content : null;

    await category.save();

    expireTag("categories");

    return NextResponse.json({ success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error: any) {
    console.error("PUT Category Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 1. Verify admin
    const { error } = await requireAdmin();
    if (error) return error;

    await dbConnect();

    // 2. Check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 }
      );
    }

    // 3. Update children parent to point to null or the parent's parent
    await Category.updateMany(
      { parentCategoryId: id },
      { parentCategoryId: category.parentCategoryId }
    );

    // 4. Delete category
    await Category.deleteOne({ _id: id });

    expireTag("categories");

    return NextResponse.json({ success: true,
      message: "Category deleted successfully and child links updated",
    });
  } catch (error: any) {
    console.error("DELETE Category Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete category" },
      { status: 500 }
    );
  }
}
