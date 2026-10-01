
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "feedback": {
                  Row: {
                    "app_version": string | null,"created_at": string,"id": string,"message": string,"platform": string | null,"user_id": string | null
                  }
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"id"?: string,"message": string,"platform"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"id"?: string,"message"?: string,"platform"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"onboarding_responses": {
                  Row: {
                    "answers": NonNullable<Json>,"consent_health_data_at": string | null,"consent_text_version": string | null,"created_at": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "answers": NonNullable<Json>,"consent_health_data_at"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"consent_health_data_at"?: string | null,"consent_text_version"?: string | null,"created_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_reports": {
                  Row: {
                    "created_at": string,"id": string,"message": string | null,"product_id": string,"status": string,"type": string,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"product_id": string,"status"?: string,"type": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"product_id"?: string,"status"?: string,"type"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_reports_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "additives_tags": Json | null,"ai_enriched": boolean | null,"barcode": string | null,"brand": string | null,"category": string | null,"created_at": string | null,"data_source": string,"id": string,"image_url": string | null,"ingredients_text": string | null,"nutriments": Json | null,"product_name": string,"updated_at": string | null
                  }
                  Insert: {
                    "additives_tags"?: Json | null,"ai_enriched"?: boolean | null,"barcode"?: string | null,"brand"?: string | null,"category"?: string | null,"created_at"?: string | null,"data_source": string,"id"?: string,"image_url"?: string | null,"ingredients_text"?: string | null,"nutriments"?: Json | null,"product_name": string,"updated_at"?: string | null
                  }
                  Update: {
                    "additives_tags"?: Json | null,"ai_enriched"?: boolean | null,"barcode"?: string | null,"brand"?: string | null,"category"?: string | null,"created_at"?: string | null,"data_source"?: string,"id"?: string,"image_url"?: string | null,"ingredients_text"?: string | null,"nutriments"?: Json | null,"product_name"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"products_staging": {
                  Row: {
                    "barcode": string | null,"discard_reason": string | null,"fetched_at": string,"id": string,"merge_status": string,"merged_at": string | null,"merged_into": string | null,"raw_payload": NonNullable<Json>,"run_id": string,"source": string
                  }
                  Insert: {
                    "barcode"?: string | null,"discard_reason"?: string | null,"fetched_at"?: string,"id"?: string,"merge_status"?: string,"merged_at"?: string | null,"merged_into"?: string | null,"raw_payload": NonNullable<Json>,"run_id": string,"source": string
                  }
                  Update: {
                    "barcode"?: string | null,"discard_reason"?: string | null,"fetched_at"?: string,"id"?: string,"merge_status"?: string,"merged_at"?: string | null,"merged_into"?: string | null,"raw_payload"?: NonNullable<Json>,"run_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_staging_merged_into_fkey"
      columns: ["merged_into"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string | null,"first_name": string | null,"id": string,"last_name": string | null,"phone": string | null,"username": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"first_name"?: string | null,"id": string,"last_name"?: string | null,"phone"?: string | null,"username"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"phone"?: string | null,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"saved_products": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"scan_history": {
                  Row: {
                    "id": string,"product_id": string,"scanned_at": string,"user_id": string
                  }
                  Insert: {
                    "id"?: string,"product_id": string,"scanned_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"product_id"?: string,"scanned_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scan_history_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"source": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"source"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"source"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "search_products_by_name":
{ Args: { "match_limit"?: number,"search_query": string }; Returns: {
              "additives_tags": Json | null,
"ai_enriched": boolean | null,
"barcode": string | null,
"brand": string | null,
"category": string | null,
"created_at": string | null,
"data_source": string,
"id": string,
"image_url": string | null,
"ingredients_text": string | null,
"nutriments": Json | null,
"product_name": string,
"updated_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "products"
        isOneToOne: false
        isSetofReturn: true
      } },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

