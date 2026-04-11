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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      classes: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          meet_link: string | null
          scheduled_at: string | null
          status: string
          step_id: string | null
          student_id: string | null
          teacher_id: string | null
          teacher_notes: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          meet_link?: string | null
          scheduled_at?: string | null
          status?: string
          step_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
          teacher_notes?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          meet_link?: string | null
          scheduled_at?: string | null
          status?: string
          step_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
          teacher_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      group_students: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          student_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          student_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          language_id: string
          level_id: string
          meet_link: string | null
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          language_id: string
          level_id: string
          meet_link?: string | null
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          language_id?: string
          level_id?: string
          meet_link?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          active: boolean | null
          code: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          code: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          code?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          code: string
          created_at: string | null
          id: string
          language_id: string
          name: string
          order_index: number
          total_steps: number
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          language_id: string
          name: string
          order_index: number
          total_steps?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          language_id?: string
          name?: string
          order_index?: number
          total_steps?: number
        }
        Relationships: [
          {
            foreignKeyName: "levels_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean | null
          created_at: string | null
          delivery: string
          file_url: string | null
          filename: string | null
          id: string
          level_id: string | null
          step_id: string | null
          title: string
          type: string
          unit_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          delivery: string
          file_url?: string | null
          filename?: string | null
          id?: string
          level_id?: string | null
          step_id?: string | null
          title: string
          type: string
          unit_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          delivery?: string
          file_url?: string | null
          filename?: string | null
          id?: string
          level_id?: string | null
          step_id?: string | null
          title?: string
          type?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          name: string
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          name: string
          phone?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      steps: {
        Row: {
          created_at: string | null
          id: string
          number: number
          title: string
          type: string
          unit_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          number: number
          title: string
          type: string
          unit_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          number?: number
          title?: string
          type?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      student_materials: {
        Row: {
          accessed_at: string | null
          available_at: string | null
          id: string
          material_id: string
          student_id: string
        }
        Insert: {
          accessed_at?: string | null
          available_at?: string | null
          id?: string
          material_id: string
          student_id: string
        }
        Update: {
          accessed_at?: string | null
          available_at?: string | null
          id?: string
          material_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_materials_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          done_at: string | null
          id: string
          status: string
          step_id: string
          student_id: string
          unlocked_at: string | null
        }
        Insert: {
          done_at?: string | null
          id?: string
          status?: string
          step_id: string
          student_id: string
          unlocked_at?: string | null
        }
        Update: {
          done_at?: string | null
          id?: string
          status?: string
          step_id?: string
          student_id?: string
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string | null
          current_step_id: string | null
          enrollment_date: string | null
          id: string
          language_id: string | null
          level_id: string | null
          onboarding_completed: boolean | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_step_id?: string | null
          enrollment_date?: string | null
          id?: string
          language_id?: string | null
          level_id?: string | null
          onboarding_completed?: boolean | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_step_id?: string | null
          enrollment_date?: string | null
          id?: string
          language_id?: string | null
          level_id?: string | null
          onboarding_completed?: boolean | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_languages: {
        Row: {
          id: string
          language_id: string
          teacher_id: string
        }
        Insert: {
          id?: string
          language_id: string
          teacher_id: string
        }
        Update: {
          id?: string
          language_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_languages_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_languages_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_students: {
        Row: {
          assigned_at: string | null
          id: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          assigned_at?: string | null
          id?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          assigned_at?: string | null
          id?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string | null
          id: string
          level_id: string
          meet_link: string | null
          number: number
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          level_id: string
          meet_link?: string | null
          number: number
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          level_id?: string
          meet_link?: string | null
          number?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
