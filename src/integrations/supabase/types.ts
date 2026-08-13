export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      actual_entries: {
        Row: {
          actual_value: number | null
          comments: string | null
          data_source_type: string
          entered_at: string
          entered_by: string | null
          id: string
          kpi_definition_id: string
          reporting_date: string
          rubric_level: number | null
        }
        Insert: {
          actual_value?: number | null
          comments?: string | null
          data_source_type?: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          kpi_definition_id: string
          reporting_date?: string
          rubric_level?: number | null
        }
        Update: {
          actual_value?: number | null
          comments?: string | null
          data_source_type?: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          kpi_definition_id?: string
          reporting_date?: string
          rubric_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actual_entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_entries_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_value: Json | null
          before_value: Json | null
          employee_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
          timestamp: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_value?: Json | null
          before_value?: Json | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
          timestamp?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_value?: Json | null
          before_value?: Json | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_department_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_department_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          id: string
          is_demo: boolean
          manager_id: string | null
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          id: string
          is_demo?: boolean
          manager_id?: string | null
          name: string
          role?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          name?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          actual_entry_id: string
          description: string | null
          file_hash: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          actual_entry_id: string
          description?: string | null
          file_hash: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          actual_entry_id?: string
          description?: string | null
          file_hash?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_actual_entry_id_fkey"
            columns: ["actual_entry_id"]
            isOneToOne: false
            referencedRelation: "actual_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          approver_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          employee_id: string
          id: string
          kpi_type: string
          milestones: Json | null
          name: string
          period_end: string
          period_start: string
          perspective: string
          reviewer_id: string | null
          rubric_id: string | null
          status: string
          target_value: number | null
          unit: string | null
          weight_percent: number
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          employee_id: string
          id?: string
          kpi_type: string
          milestones?: Json | null
          name: string
          period_end: string
          period_start: string
          perspective: string
          reviewer_id?: string | null
          rubric_id?: string | null
          status?: string
          target_value?: number | null
          unit?: string | null
          weight_percent: number
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          kpi_type?: string
          milestones?: Json | null
          name?: string
          period_end?: string
          period_start?: string
          perspective?: string
          reviewer_id?: string | null
          rubric_id?: string | null
          status?: string
          target_value?: number | null
          unit?: string | null
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          created_at: string
          id: string
          levels: Json
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          levels?: Json
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          levels?: Json
          name?: string
        }
        Relationships: []
      }
      score_records: {
        Row: {
          achievement_percent: number | null
          adjustment_delta: number
          adjustment_justification: string | null
          adjustment_reason_code: string | null
          approved_at: string | null
          approved_by: string | null
          calculated_score: number | null
          calculation_trace: Json | null
          created_at: string
          final_score: number | null
          id: string
          kpi_definition_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          version_number: number
        }
        Insert: {
          achievement_percent?: number | null
          adjustment_delta?: number
          adjustment_justification?: string | null
          adjustment_reason_code?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_score?: number | null
          calculation_trace?: Json | null
          created_at?: string
          final_score?: number | null
          id?: string
          kpi_definition_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          version_number?: number
        }
        Update: {
          achievement_percent?: number | null
          adjustment_delta?: number
          adjustment_justification?: string | null
          adjustment_reason_code?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_score?: number | null
          calculation_trace?: Json | null
          created_at?: string
          final_score?: number | null
          id?: string
          kpi_definition_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_records_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_policy: {
        Row: {
          achievement_cap: number
          achievement_floor: number
          adjustment_escalation_threshold: number
          department_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          achievement_cap?: number
          achievement_floor?: number
          adjustment_escalation_threshold?: number
          department_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          achievement_cap?: number
          achievement_floor?: number
          adjustment_escalation_threshold?: number
          department_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_policy_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reset_demo_data: { Args: never; Returns: undefined }
      reset_demo_data_base: { Args: never; Returns: undefined }
      seed_demo_history: { Args: never; Returns: undefined }
      seed_department_demo: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
