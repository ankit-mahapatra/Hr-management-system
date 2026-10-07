import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request, { params }) {
    try {
        const { employeeId } = params;

        // 🔐 1️⃣ AUTH CHECK
        const token = request.cookies.get("auth_token")?.value;

        if (!token) {
            return NextResponse.json(
                { message: "Unauthorized" },
                { status: 401 }
            );
        }

        const decoded = verifyToken(token);

        if (!decoded?.userId) {
            return NextResponse.json(
                { message: "Invalid token" },
                { status: 401 }
            );
        }

        if (decoded.role !== "ADMIN") {
            return NextResponse.json(
                { message: "Access denied. Admins only." },
                { status: 403 }
            );
        }

        const organizationId = decoded.organizationId;

        // 📦 2️⃣ GET FORM DATA
        const formData = await request.formData();

        const documentType = formData.get("documentType");
        const documentName = formData.get("documentName");
        const documentNumber = formData.get("documentNumber");
        const file = formData.get("file");

        if (!documentType) {
            return NextResponse.json(
                { message: "Document type is required" },
                { status: 400 }
            );
        }

        if (!file || file.size === 0) {
            return NextResponse.json(
                { message: "File is required" },
                { status: 400 }
            );
        }

        // 🚫 3️⃣ FILE VALIDATION
        const allowedTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/jpg",
        ];

        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { message: "Only PDF, JPG, PNG files are allowed" },
                { status: 400 }
            );
        }

        const maxSize = 5 * 1024 * 1024;

        if (file.size > maxSize) {
            return NextResponse.json(
                { message: "File size must be under 5MB" },
                { status: 400 }
            );
        }

        // 👤 4️⃣ FIND USER (Organization Safe)
        const user = await prisma.user.findFirst({
            where: {
                employeeId,
                organizationId,
            },
        });

        if (!user) {
            return NextResponse.json(
                { message: "User not found" },
                { status: 404 }
            );
        }

        // 🚫 5️⃣ PREVENT DUPLICATE DOCUMENT TYPE
        const existingDocument = await prisma.userDocument.findFirst({
            where: {
                userId: user.id,
                organizationId,
                documentType,
            },
        });

        if (existingDocument) {
            return NextResponse.json(
                { message: "This document type is already uploaded" },
                { status: 400 }
            );
        }

        // ☁️ 6️⃣ UPLOAD TO SUPABASE STORAGE
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const bucket =
            process.env.SUPABASE_EMPLOYEE_DOCUMENTS_BUCKET;

        if (!bucket) {
            throw new Error(
                "SUPABASE_EMPLOYEE_DOCUMENTS_BUCKET is missing."
            );
        }

        // Create unique file name
        const fileName = `${Date.now()}-${file.name}`;

        // Create storage path
        const filePath = `hrms/user-documents/${organizationId}/${employeeId}/${fileName}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) {
            console.error("Supabase upload error:", uploadError);
            throw uploadError;
        }

        // Store Supabase Storage path in database
        const fileUrl = filePath;
        const publicId = filePath;

        // 💾 7️⃣ SAVE TO DATABASE
        const document = await prisma.userDocument.create({
            data: {
                userId: user.id,
                organizationId,
                documentType,
                documentName,
                documentNumber: documentNumber || null,
                fileUrl,
                filePublicId: publicId,
                fileType: file.type,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Document uploaded successfully",
            document,
        });

    } catch (error) {
        console.error("Document upload error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Upload failed",
            },
            { status: 500 }
        );
    }
}

export async function GET(request, { params }) {
    try {
        const token = request.cookies.get("auth_token")?.value;

        if (!token) {
            return NextResponse.json(
                { message: "Unauthorized" },
                { status: 401 }
            );
        }

        const decoded = verifyToken(token);

        if (!decoded?.userId) {
            return NextResponse.json(
                { message: "Invalid token" },
                { status: 401 }
            );
        }

        const { employeeId } = params;

        console.log("The empoyeeId is: ", employeeId);

        const user = await prisma.user.findFirst({
            where: { employeeId },
            include: {
                documents: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { message: "User not found" },
                { status: 404 }
            );
        }

        // 🔗 Generate temporary signed URLs
        const bucket =
            process.env.SUPABASE_EMPLOYEE_DOCUMENTS_BUCKET;

        const documentsWithUrls = await Promise.all(
            user.documents.map(async (document) => {
                const { data: signedUrlData, error: signedUrlError } =
                    await supabaseAdmin.storage
                        .from(bucket)
                        .createSignedUrl(document.fileUrl, 3600);

                if (signedUrlError) {
                    console.error(
                        "Signed URL error:",
                        signedUrlError
                    );

                    return {
                        ...document,
                        fileUrl: null,
                    };
                }

                return {
                    ...document,
                    fileUrl: signedUrlData.signedUrl,
                };
            })
        );

        return NextResponse.json({
            success: true,
            documents: documentsWithUrls,
        });

    } catch (error) {
        console.error(error);

        return new Response(
            "Error fetching documents",
            { status: 500 }
        );
    }
}