import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CustomField from "@/models/CustomField";
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
      dependsOnValueMap,
      allowCustom,
    } = body;

    await dbConnect();

    const field = await CustomField.findById(id);
    if (!field) {
      return NextResponse.json(
        { success: false, message: "Custom field not found" },
        { status: 404 }
      );
    }

    if (name && name.trim() !== field.name) {
      field.name = name.trim();
      let baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 0;
      while (await CustomField.findOne({ slug, _id: { $ne: id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      field.slug = slug;
    }

    if (type !== undefined) field.type = type;
    if (required !== undefined) field.required = Boolean(required);
    if (values !== undefined)
      field.values = Array.isArray(values) ? values.map((v: string) => v.trim()).filter(Boolean) : [];
    if (minLength !== undefined) field.minLength = minLength ? Number(minLength) : null;
    if (maxLength !== undefined) field.maxLength = maxLength ? Number(maxLength) : null;
    if (image !== undefined) field.image = image ? image.trim() : null;
    if (categoryIds !== undefined) field.categoryIds = Array.isArray(categoryIds) ? categoryIds : [];
    if (status !== undefined) field.status = Boolean(status);

    // ── OLX-parity metadata ──
    if (unit !== undefined) field.unit = unit ? String(unit).trim() : null;
    if (placeholder !== undefined) field.placeholder = placeholder ? String(placeholder).trim() : null;
    if (helpText !== undefined) field.helpText = helpText ? String(helpText).trim() : null;
    if (group !== undefined) field.group = group ? String(group).trim() : null;
    if (sequence !== undefined)
      field.sequence = sequence !== null && sequence !== "" ? Number(sequence) : 0;
    if (filterable !== undefined) field.filterable = Boolean(filterable);
    if (searchable !== undefined) field.searchable = Boolean(searchable);
    if (urlFacet !== undefined) field.urlFacet = Boolean(urlFacet);
    if (allowCustom !== undefined) field.allowCustom = Boolean(allowCustom);
    if (min !== undefined) field.min = min !== null && min !== "" ? Number(min) : null;
    if (max !== undefined) field.max = max !== null && max !== "" ? Number(max) : null;
    if (dependsOnSlug !== undefined)
      field.dependsOnSlug = dependsOnSlug ? String(dependsOnSlug).trim() : null;
    if (dependsOnValueMap !== undefined)
      field.dependsOnValueMap =
        dependsOnValueMap && typeof dependsOnValueMap === "object" ? dependsOnValueMap : null;

    await field.save();
    expireTag("categories");

    return NextResponse.json({
      success: true,
      message: "Custom field updated successfully",
      data: field,
    });
  } catch (error: any) {
    console.error("PUT Custom Field Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update custom field" },
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

    const result = await CustomField.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Custom field not found" },
        { status: 404 }
      );
    }

    expireTag("categories");
    return NextResponse.json({
      success: true,
      message: "Custom field deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE Custom Field Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete custom field" },
      { status: 500 }
    );
  }
}
