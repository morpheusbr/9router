import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Validates the JSON body of a Next.js App Router Request against a Zod schema.
 * If validation fails, returns a standard 400 Bad Request response.
 * If successful, passes the parsed (and typed) data to the handler.
 * 
 * @param {import("zod").ZodType} schema - The Zod schema to validate against
 * @param {Function} handler - The async handler (request, parsedBody) => NextResponse
 */
export const withBodyValidation = (schema, handler) => {
  return async (request, ...args) => {
    try {
      // Handle empty bodies gracefully
      let body = {};
      try {
        body = await request.clone().json();
      } catch (err) {
        // If it fails to parse JSON, assume empty object and let Zod handle missing fields
      }

      // Validate using Zod
      const parsed = schema.parse(body);
      
      // If valid, pass parsed data down
      return handler(request, parsed, ...args);
    } catch (error) {
      if (error instanceof ZodError) {
        // Format the Zod error for the frontend
        const issues = error.issues || error.errors || [];
        const errorMessages = issues.map(err => {
          const path = err.path.join(".");
          return path ? `${path}: ${err.message}` : err.message;
        });
        
        return NextResponse.json(
          { 
            error: "Validation failed", 
            details: errorMessages,
            // Provide a flat error string for simple UIs that just read data.error
            message: errorMessages.join(", ")
          },
          { status: 400 }
        );
      }
      
      // Pass other runtime errors down to be handled (or return 500)
      console.error("Internal Server Error in validation wrapper:", error);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  };
};
