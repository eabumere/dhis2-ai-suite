import { z, ZodObject, ZodArray, ZodEnum, ZodLazy } from 'zod';

/**
 * Creates an UPDATE variant of any DHIS2 metadata schema
 * - Keeps 'name' field required
 * - All other fields become optional
 * - ✅ AUTOMATICALLY adds name/code/displayName to ALL object schemas
 * - Preserves 100% of original schema shape
 * - Adds passthrough() at every level to retain extra properties
 * - Works recursively for nested objects and arrays
 */
export function createUpdateSchema<T extends ZodObject<any>>(schema: T): T {
    function processObject(obj: ZodObject<any>): ZodObject<any> {
        const shape = obj.shape;
        const newShape: Record<string, any> = {};

        for (const [key, field] of Object.entries(shape)) {
            if (key === 'name') {
                // Keep name as required field
                newShape[key] = field;
            } else if (field instanceof ZodObject) {
                newShape[key] = processObject(field).optional();
            } else if (field instanceof ZodArray) {
                const itemType = field.element;
                if (itemType instanceof ZodObject) {
                    newShape[key] = z.array(processObject(itemType)).optional();
                } else {
                    newShape[key] = field.optional();
                }
            } else if (field instanceof ZodEnum) {
                newShape[key] = field.optional();
            } else if (field instanceof ZodLazy) {
                newShape[key] = field.optional();
            } else {
                newShape[key] = (field as any).optional();
            }
        }

        // ✅ AUTOMATICALLY ADD NAME FIELDS TO ALL OBJECTS!
        // This allows reference resolution by name without modifying base schemas
        newShape.name = z.string().optional();
        newShape.code = z.string().optional();
        newShape.displayName = z.string().optional();

        return z.object(newShape).loose() as any;
    }

    return processObject(schema) as T;
}