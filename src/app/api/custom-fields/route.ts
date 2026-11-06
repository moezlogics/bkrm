import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CustomField from "@/models/CustomField";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    await dbConnect();

    const query: any = {};
    if (activeOnly) {
      query.status = true;
    }

    if (categoryId) {
      // 1. Gather all category IDs in the inheritance hierarchy (from leaf to root)
      const categoryHierarchyIds: string[] = [categoryId];
      let currentCategory = await Category.findById(categoryId).lean();

      while (currentCategory && currentCategory.parentCategoryId) {
        const parentIdStr = currentCategory.parentCategoryId.toString();
        categoryHierarchyIds.push(parentIdStr);
        currentCategory = await Category.findById(parentIdStr).lean();
      }

      // 2. Query custom fields assigned to any category in the hierarchy
      query.categoryIds = { $in: categoryHierarchyIds };
    }

    const fields = await CustomField.find(query).sort({ sequence: 1, name: 1 });
    return NextResponse.json({ success: true, data: fields });
  } catch (error: any) {
    console.error("GET Custom Fields Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch custom fields" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const {
      name,
      type,
      required,
      values,
      minLength,
      maxLength,
      image,
      categoryIds,
      status,
      // ── OLX-parity metadata ──
      unit,
      placeholder,
      helpText,
      group,
      sequence,
      filterable,
      searchable,
      urlFacet,
      min,
      max,
      dependsOnSlug,
      allowCustom,
      dependsOnValueMap,
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, message: "Name and Type are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Create slug
    let baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    while (await CustomField.findOne({ slug })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }

    // 3. Create CustomField
    const customField = await CustomField.create({
      name: name.trim(),
      slug,
      type,
      required: required !== undefined ? Boolean(required) : false,
      values: Array.isArray(values) ? values.map((v: string) => v.trim()).filter(Boolean) : [],
      minLength: minLength ? Number(minLength) : null,
      maxLength: maxLength ? Number(maxLength) : null,
      image: image ? image.trim() : null,
      categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
      status: status !== undefined ? Boolean(status) : true,
      // ── OLX-parity metadata ──
      unit: unit ? String(unit).trim() : null,
      placeholder: placeholder ? String(placeholder).trim() : null,
      helpText: helpText ? String(helpText).trim() : null,
      group: group ? String(group).trim() : null,
      sequence: sequence !== undefined && sequence !== null && sequence !== "" ? Number(sequence) : 0,
      filterable: filterable !== undefined ? Boolean(filterable) : false,
      searchable: searchable !== undefined ? Boolean(searchable) : false,
      urlFacet: urlFacet !== undefined ? Boolean(urlFacet) : false,
      allowCustom: allowCustom !== undefined ? Boolean(allowCustom) : true,
      min: min !== undefined && min !== null && min !== "" ? Number(min) : null,
      max: max !== undefined && max !== null && max !== "" ? Number(max) : null,
      dependsOnSlug: dependsOnSlug ? String(dependsOnSlug).trim() : null,
      dependsOnValueMap:
        dependsOnValueMap && typeof dependsOnValueMap === "object" ? dependsOnValueMap : null,
    });

    expireTag("categories");
    return NextResponse.json({
      success: true,
      message: "Custom field created successfully",
      data: customField,
    });
  } catch (error: any) {
    console.error("POST Custom Field Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create custom field" },
      { status: 500 }
    );
  }
}
