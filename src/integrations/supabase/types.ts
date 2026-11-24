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
      admin_notifications: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          idempotency_key: string | null
          link: string | null
          message: string | null
          metadata: Json
          read_at: string | null
          severity: string
          title: string
          type: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          idempotency_key?: string | null
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title: string
          type: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          idempotency_key?: string | null
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      admin_tenant_impersonation_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_metrics: {
        Row: {
          created_at: string
          details: Json | null
          doctor_id: string | null
          id: string
          metric_type: string
          ocr_job_id: string | null
          tenant_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          doctor_id?: string | null
          id?: string
          metric_type: string
          ocr_job_id?: string | null
          tenant_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          doctor_id?: string | null
          id?: string
          metric_type?: string
          ocr_job_id?: string | null
          tenant_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_metrics_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_metrics_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "prescription_ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          due_reminder_days: number[]
          due_reminder_enabled: boolean
          expiry_days: number[]
          expiry_enabled: boolean
          low_stock_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          due_reminder_days?: number[]
          due_reminder_enabled?: boolean
          expiry_days?: number[]
          expiry_enabled?: boolean
          low_stock_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          due_reminder_days?: number[]
          due_reminder_enabled?: boolean
          expiry_days?: number[]
          expiry_enabled?: boolean
          low_stock_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_ips: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          ip_address: unknown
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address: unknown
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_ips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_dismissible: boolean
          level: string
          plan_code: string | null
          starts_at: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_dismissible?: boolean
          level?: string
          plan_code?: string | null
          starts_at?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_dismissible?: boolean
          level?: string
          plan_code?: string | null
          starts_at?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          hash: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scope: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hash: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scope: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hash?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scope?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_admins: {
        Row: {
          created_at: string
          granted_by: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      approval_logs: {
        Row: {
          action: string
          approved_by: string | null
          created_at: string
          from_status: string | null
          id: string
          remarks: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          action: string
          approved_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          remarks?: string | null
          tenant_id: string
          to_status: string
        }
        Update: {
          action?: string
          approved_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          remarks?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          check_in: string | null
          check_out: string | null
          created_at: string
          id: string
          notes: string | null
          staff_id: string
          status: string
          tenant_id: string
          updated_at: string
          worked_minutes: number | null
        }
        Insert: {
          attendance_date: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          worked_minutes?: number | null
        }
        Update: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          worked_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          branch_id: string | null
          browser: string | null
          created_at: string
          device: string | null
          entity_id: string | null
          entity_table: string | null
          id: string
          ip_address: unknown
          session_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          browser?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          ip_address?: unknown
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          browser?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          ip_address?: unknown
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_history: {
        Row: {
          backup_id: string | null
          backup_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          file_name: string
          file_size: number
          id: string
          started_at: string
          status: string
          storage_path: string | null
          tenant_id: string
          trigger: string
        }
        Insert: {
          backup_id?: string | null
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name: string
          file_size?: number
          id?: string
          started_at?: string
          status?: string
          storage_path?: string | null
          tenant_id: string
          trigger?: string
        }
        Update: {
          backup_id?: string | null
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name?: string
          file_size?: number
          id?: string
          started_at?: string
          status?: string
          storage_path?: string | null
          tenant_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_history_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_jobs: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          cron_expression: string | null
          encrypted: boolean
          format: string
          frequency: string
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          status: string
          storage: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          cron_expression?: string | null
          encrypted?: boolean
          format?: string
          frequency?: string
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          status?: string
          storage?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          cron_expression?: string | null
          encrypted?: boolean
          format?: string
          frequency?: string
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          status?: string
          storage?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          detail: string | null
          finished_at: string | null
          id: string
          kind: string
          size_bytes: number | null
          started_at: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          detail?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          size_bytes?: number | null
          started_at?: string
          status: string
          tenant_id?: string | null
        }
        Update: {
          detail?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          size_bytes?: number | null
          started_at?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      barcode_sequences: {
        Row: {
          next_serial: number
          tenant_code: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          next_serial?: number
          tenant_code: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          next_serial?: number
          tenant_code?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barcode_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_recalls: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string | null
          qty_locked: number
          recall_date: string
          recall_reason: string
          recall_source: string
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          qty_locked?: number
          recall_date?: string
          recall_reason: string
          recall_source: string
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          qty_locked?: number
          recall_date?: string
          recall_reason?: string
          recall_source?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_recalls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_recalls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_recalls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_recalls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_no: string
          branch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          expiry_date: string
          id: string
          import_batch_id: string | null
          is_opening: boolean
          mfg_date: string | null
          mrp: number | null
          product_id: string
          purchase_price: number
          qty_on_hand: number
          source: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          batch_no: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date: string
          id?: string
          import_batch_id?: string | null
          is_opening?: boolean
          mfg_date?: string | null
          mrp?: number | null
          product_id: string
          purchase_price?: number
          qty_on_hand?: number
          source?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          batch_no?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string
          id?: string
          import_batch_id?: string | null
          is_opening?: boolean
          mfg_date?: string | null
          mrp?: number | null
          product_id?: string
          purchase_price?: number
          qty_on_hand?: number
          source?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          status: string | null
          subscription_id: string | null
          tenant_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          author_name: string | null
          category: string | null
          content: string
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          language: string
          published_at: string | null
          reading_minutes: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          language?: string
          published_at?: string | null
          reading_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          language?: string
          published_at?: string | null
          reading_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      branch_settings: {
        Row: {
          address: string | null
          branch_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          expiry_alert_days: number
          id: string
          invoice_prefix: string | null
          low_stock_threshold: number
          pos_settings: Json
          printer_profile_id: string | null
          printer_settings: Json
          receipt_footer: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          expiry_alert_days?: number
          id?: string
          invoice_prefix?: string | null
          low_stock_threshold?: number
          pos_settings?: Json
          printer_profile_id?: string | null
          printer_settings?: Json
          receipt_footer?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          expiry_alert_days?: number
          id?: string
          invoice_prefix?: string | null
          low_stock_threshold?: number
          pos_settings?: Json
          printer_profile_id?: string | null
          printer_settings?: Json
          receipt_footer?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          branch_role: string
          code: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          is_main: boolean
          name: string
          parent_branch_id: string | null
          phone: string | null
          royalty_percent: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_role?: string
          code: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          name: string
          parent_branch_id?: string | null
          phone?: string | null
          royalty_percent?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_role?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          name?: string
          parent_branch_id?: string | null
          phone?: string | null
          royalty_percent?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_transactions: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_method: string | null
          reference_id: string | null
          reference_no: string | null
          reference_table: string | null
          register_id: string
          tenant_id: string
          transaction_type: Database["public"]["Enums"]["cash_txn_type"]
        }
        Insert: {
          amount?: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          reference_id?: string | null
          reference_no?: string | null
          reference_table?: string | null
          register_id: string
          tenant_id: string
          transaction_type: Database["public"]["Enums"]["cash_txn_type"]
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          reference_id?: string | null
          reference_no?: string | null
          reference_table?: string | null
          register_id?: string
          tenant_id?: string
          transaction_type?: Database["public"]["Enums"]["cash_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "cash_register_transactions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          actual_closing_amount: number | null
          branch_id: string | null
          closed_at: string | null
          closing_notes: string | null
          created_at: string
          expected_closing_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          register_name: string
          status: Database["public"]["Enums"]["cash_register_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_closing_amount?: number | null
          branch_id?: string | null
          closed_at?: string | null
          closing_notes?: string | null
          created_at?: string
          expected_closing_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          register_name: string
          status?: Database["public"]["Enums"]["cash_register_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_closing_amount?: number | null
          branch_id?: string | null
          closed_at?: string | null
          closing_notes?: string | null
          created_at?: string
          expected_closing_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          register_name?: string
          status?: Database["public"]["Enums"]["cash_register_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "cash_registers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance_by_warehouse"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_audit: {
        Row: {
          action_taken: string | null
          branch_id: string
          created_at: string
          details: Json
          id: string
          patient_id: string | null
          pharmacist_id: string | null
          prescription_id: string | null
          sale_id: string | null
          severity: string
          tenant_id: string
          warning_type: string
        }
        Insert: {
          action_taken?: string | null
          branch_id: string
          created_at?: string
          details?: Json
          id?: string
          patient_id?: string | null
          pharmacist_id?: string | null
          prescription_id?: string | null
          sale_id?: string | null
          severity: string
          tenant_id: string
          warning_type: string
        }
        Update: {
          action_taken?: string | null
          branch_id?: string
          created_at?: string
          details?: Json
          id?: string
          patient_id?: string | null
          pharmacist_id?: string | null
          prescription_id?: string | null
          sale_id?: string | null
          severity?: string
          tenant_id?: string
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_audit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_audit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "clinical_audit_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_audit_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_audit_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_audit_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "clinical_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_log: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          provider: string | null
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          template_name: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          iso2: string | null
          iso3: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          iso2?: string | null
          iso3?: string | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          iso2?: string | null
          iso3?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "countries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_campaigns: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          recipient_count: number
          scheduled_at: string | null
          segment: string
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          name: string
          recipient_count?: number
          scheduled_at?: string | null
          segment?: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          recipient_count?: number
          scheduled_at?: string | null
          segment?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_loyalty_points: {
        Row: {
          created_at: string
          customer_id: string
          entry_type: string
          id: string
          notes: string | null
          points: number
          reference_id: string | null
          reference_table: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          entry_type: string
          id?: string
          notes?: string | null
          points: number
          reference_id?: string | null
          reference_table?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          entry_type?: string
          id?: string
          notes?: string | null
          points?: number
          reference_id?: string | null
          reference_table?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_loyalty_points_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          branch_id: string
          client_op_id: string | null
          collected_by: string | null
          created_at: string
          customer_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          reference: string | null
          sale_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          client_op_id?: string | null
          collected_by?: string | null
          created_at?: string
          customer_id: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          reference?: string | null
          sale_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          client_op_id?: string | null
          collected_by?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          reference?: string | null
          sale_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "customer_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_points: {
        Row: {
          balance: number
          created_at: string
          created_by: string | null
          customer_id: string
          expiry_date: string | null
          id: string
          note: string | null
          points_earned: number
          points_used: number
          sale_id: string | null
          tenant_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          points_earned?: number
          points_used?: number
          sale_id?: string | null
          tenant_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          points_earned?: number
          points_used?: number
          sale_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_points_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      customer_prices: {
        Row: {
          created_at: string
          customer_id: string
          discount_pct: number
          id: string
          product_id: string
          tenant_id: string
          unit_price: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_pct?: number
          id?: string
          product_id: string
          tenant_id: string
          unit_price: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_pct?: number
          id?: string
          product_id?: string
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "customer_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reminders: {
        Row: {
          amount: number | null
          channel: string
          created_at: string
          customer_id: string
          due_days: number | null
          id: string
          message: string | null
          payload: Json | null
          reminder_type: string
          sent_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount?: number | null
          channel?: string
          created_at?: string
          customer_id: string
          due_days?: number | null
          id?: string
          message?: string | null
          payload?: Json | null
          reminder_type: string
          sent_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number | null
          channel?: string
          created_at?: string
          customer_id?: string
          due_days?: number | null
          id?: string
          message?: string | null
          payload?: Json | null
          reminder_type?: string
          sent_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          allergies: string | null
          anniversary: string | null
          area: string | null
          bin_no: string | null
          blood_group: string | null
          chronic_diseases: string | null
          country: string | null
          created_at: string
          credit_limit: number
          customer_code: string | null
          date_of_birth: string | null
          district: string | null
          division: string | null
          doctor_reference: string | null
          due_balance: number
          email: string | null
          gender: string | null
          id: string
          is_active: boolean
          name: string
          nid_passport: string | null
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          postal_code: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          vat_no: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          anniversary?: string | null
          area?: string | null
          bin_no?: string | null
          blood_group?: string | null
          chronic_diseases?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          customer_code?: string | null
          date_of_birth?: string | null
          district?: string | null
          division?: string | null
          doctor_reference?: string | null
          due_balance?: number
          email?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          name: string
          nid_passport?: string | null
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          vat_no?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          anniversary?: string | null
          area?: string | null
          bin_no?: string | null
          blood_group?: string | null
          chronic_diseases?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          customer_code?: string | null
          date_of_birth?: string | null
          district?: string | null
          division?: string | null
          doctor_reference?: string | null
          due_balance?: number
          email?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nid_passport?: string | null
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          vat_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_archives: {
        Row: {
          created_at: string
          created_by: string | null
          destination: string
          id: string
          last_row_count: number
          last_run_at: string | null
          module: string
          name: string
          older_than_days: number
          status: string
          storage_path: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          last_row_count?: number
          last_run_at?: string | null
          module: string
          name: string
          older_than_days?: number
          status?: string
          storage_path?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          last_row_count?: number
          last_run_at?: string | null
          module?: string
          name?: string
          older_than_days?: number
          status?: string
          storage_path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_cleanup_logs: {
        Row: {
          cleanup_type: string
          completed_at: string | null
          created_at: string
          executed_by: string | null
          id: string
          notes: string | null
          records_affected: number
          records_scanned: number
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          cleanup_type: string
          completed_at?: string | null
          created_at?: string
          executed_by?: string | null
          id?: string
          notes?: string | null
          records_affected?: number
          records_scanned?: number
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          cleanup_type?: string
          completed_at?: string | null
          created_at?: string
          executed_by?: string | null
          id?: string
          notes?: string | null
          records_affected?: number
          records_scanned?: number
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      data_export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          file_name: string | null
          file_size: number
          format: string
          id: string
          module: string
          row_count: number
          started_at: string
          status: string
          storage_path: string | null
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name?: string | null
          file_size?: number
          format?: string
          id?: string
          module: string
          row_count?: number
          started_at?: string
          status?: string
          storage_path?: string | null
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name?: string | null
          file_size?: number
          format?: string
          id?: string
          module?: string
          row_count?: number
          started_at?: string
          status?: string
          storage_path?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      data_import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          file_name: string
          id: string
          module: string
          rows_duplicate: number
          rows_failed: number
          rows_success: number
          rows_total: number
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name: string
          id?: string
          module: string
          rows_duplicate?: number
          rows_failed?: number
          rows_success?: number
          rows_total?: number
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          file_name?: string
          id?: string
          module?: string
          rows_duplicate?: number
          rows_failed?: number
          rows_success?: number
          rows_total?: number
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      data_retention_policies: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          enabled: boolean
          entity: string
          id: string
          last_run_at: string | null
          retention_days: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          entity: string
          id?: string
          last_run_at?: string | null
          retention_days?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          entity?: string
          id?: string
          last_run_at?: string | null
          retention_days?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_model: string | null
          id: string
          last_seen_at: string
          platform: string
          tenant_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          tenant_id: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_writing_profiles: {
        Row: {
          avg_confidence: number | null
          common_medicines: Json | null
          created_at: string
          doctor_id: string
          id: string
          last_seen_at: string | null
          ocr_samples: number
          signature_samples: Json | null
          style_hints: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avg_confidence?: number | null
          common_medicines?: Json | null
          created_at?: string
          doctor_id: string
          id?: string
          last_seen_at?: string | null
          ocr_samples?: number
          signature_samples?: Json | null
          style_hints?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avg_confidence?: number | null
          common_medicines?: Json | null
          created_at?: string
          doctor_id?: string
          id?: string
          last_seen_at?: string | null
          ocr_samples?: number
          signature_samples?: Json | null
          style_hints?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_writing_profiles_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_writing_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          bmdc_no: string | null
          chamber_address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          qualification: string | null
          registration_number: string | null
          speciality: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bmdc_no?: string | null
          chamber_address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          qualification?: string | null
          registration_number?: string | null
          speciality?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bmdc_no?: string | null
          chamber_address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          qualification?: string | null
          registration_number?: string | null
          speciality?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dosage_forms: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dosage_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dosage_rules: {
        Row: {
          child_weight_required: boolean
          created_at: string
          dose_unit: string | null
          generic_id: string | null
          generic_name: string | null
          id: string
          max_daily_dose: number | null
          max_duration_days: number | null
          min_daily_dose: number | null
          notes: string | null
          pregnancy_warning: boolean
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          child_weight_required?: boolean
          created_at?: string
          dose_unit?: string | null
          generic_id?: string | null
          generic_name?: string | null
          id?: string
          max_daily_dose?: number | null
          max_duration_days?: number | null
          min_daily_dose?: number | null
          notes?: string | null
          pregnancy_warning?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          child_weight_required?: boolean
          created_at?: string
          dose_unit?: string | null
          generic_id?: string | null
          generic_name?: string | null
          id?: string
          max_daily_dose?: number | null
          max_duration_days?: number | null
          min_daily_dose?: number | null
          notes?: string | null
          pregnancy_warning?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dosage_rules_generic_id_fkey"
            columns: ["generic_id"]
            isOneToOne: false
            referencedRelation: "generics"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_interactions: {
        Row: {
          clinical_note: string | null
          created_at: string
          effect: string | null
          generic_a: string
          generic_a_id: string | null
          generic_b: string
          generic_b_id: string | null
          id: string
          management: string | null
          severity: Database["public"]["Enums"]["interaction_severity"]
          source: string | null
          tenant_id: string | null
        }
        Insert: {
          clinical_note?: string | null
          created_at?: string
          effect?: string | null
          generic_a: string
          generic_a_id?: string | null
          generic_b: string
          generic_b_id?: string | null
          id?: string
          management?: string | null
          severity: Database["public"]["Enums"]["interaction_severity"]
          source?: string | null
          tenant_id?: string | null
        }
        Update: {
          clinical_note?: string | null
          created_at?: string
          effect?: string | null
          generic_a?: string
          generic_a_id?: string | null
          generic_b?: string
          generic_b_id?: string | null
          id?: string
          management?: string | null
          severity?: Database["public"]["Enums"]["interaction_severity"]
          source?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drug_interactions_generic_a_id_fkey"
            columns: ["generic_a_id"]
            isOneToOne: false
            referencedRelation: "generics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drug_interactions_generic_b_id_fkey"
            columns: ["generic_b_id"]
            isOneToOne: false
            referencedRelation: "generics"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          release: string | null
          route: string | null
          source: string
          stack: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          release?: string | null
          route?: string | null
          source: string
          stack?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      executive_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string | null
          payload: Json | null
          resolved: boolean
          resolved_at: string | null
          severity: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message?: string | null
          payload?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string | null
          payload?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          expense_date: string
          expense_no: string
          id: string
          journal_id: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["fin_payment_method"]
          reference_no: string | null
          tenant_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_id: string
          amount: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_no: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["fin_payment_method"]
          reference_no?: string | null
          tenant_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_no?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["fin_payment_method"]
          reference_no?: string | null
          tenant_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance_by_warehouse"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "expenses_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["journal_id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_drift_log: {
        Row: {
          actual: number | null
          check_name: string
          details: Json | null
          expected: number | null
          id: string
          ran_at: string
          tenant_id: string
          variance: number | null
        }
        Insert: {
          actual?: number | null
          check_name: string
          details?: Json | null
          expected?: number | null
          id?: string
          ran_at?: string
          tenant_id: string
          variance?: number | null
        }
        Update: {
          actual?: number | null
          check_name?: string
          details?: Json | null
          expected?: number | null
          id?: string
          ran_at?: string
          tenant_id?: string
          variance?: number | null
        }
        Relationships: []
      }
      franchise_branches: {
        Row: {
          branch_id: string
          franchise_id: string
          id: string
          joined_at: string
          royalty_pct: number | null
        }
        Insert: {
          branch_id: string
          franchise_id: string
          id?: string
          joined_at?: string
          royalty_pct?: number | null
        }
        Update: {
          branch_id?: string
          franchise_id?: string
          id?: string
          joined_at?: string
          royalty_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "franchise_branches_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      franchises: {
        Row: {
          created_at: string
          created_by: string | null
          default_royalty_pct: number
          hq_branch_id: string | null
          id: string
          name: string
          notes: string | null
          region: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_royalty_pct?: number
          hq_branch_id?: string | null
          id?: string
          name: string
          notes?: string | null
          region?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_royalty_pct?: number
          hq_branch_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          region?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchises_hq_branch_id_fkey"
            columns: ["hq_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchises_hq_branch_id_fkey"
            columns: ["hq_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "franchises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_logs: {
        Row: {
          created_at: string
          direction: string
          http_status: number | null
          id: string
          payload: Json
          provider: string
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          http_status?: number | null
          id?: string
          payload?: Json
          provider: string
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          http_status?: number | null
          id?: string
          payload?: Json
          provider?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      generics: {
        Row: {
          aliases: string[]
          atc_code: string | null
          branch_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          therapeutic_class: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          atc_code?: string | null
          branch_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          therapeutic_class?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          atc_code?: string | null
          branch_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          therapeutic_class?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generics_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generics_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "generics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_barcodes: {
        Row: {
          barcode: string
          barcode_type: string
          created_at: string
          global_medicine_id: string
          id: string
          verified: boolean
        }
        Insert: {
          barcode: string
          barcode_type?: string
          created_at?: string
          global_medicine_id: string
          id?: string
          verified?: boolean
        }
        Update: {
          barcode?: string
          barcode_type?: string
          created_at?: string
          global_medicine_id?: string
          id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "global_barcodes_global_medicine_id_fkey"
            columns: ["global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_contraindications: {
        Row: {
          condition: string
          created_at: string
          id: string
          medicine_id: string
          notes: string | null
          severity: Database["public"]["Enums"]["drug_interaction_severity"]
        }
        Insert: {
          condition: string
          created_at?: string
          id?: string
          medicine_id: string
          notes?: string | null
          severity?: Database["public"]["Enums"]["drug_interaction_severity"]
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          medicine_id?: string
          notes?: string | null
          severity?: Database["public"]["Enums"]["drug_interaction_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "global_contraindications_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_dosage_guides: {
        Row: {
          administration_notes: string | null
          adult_dose: string | null
          child_dose: string | null
          created_at: string
          hepatic_adjustment: string | null
          max_daily_dose: string | null
          medicine_id: string
          renal_adjustment: string | null
          updated_at: string
        }
        Insert: {
          administration_notes?: string | null
          adult_dose?: string | null
          child_dose?: string | null
          created_at?: string
          hepatic_adjustment?: string | null
          max_daily_dose?: string | null
          medicine_id: string
          renal_adjustment?: string | null
          updated_at?: string
        }
        Update: {
          administration_notes?: string | null
          adult_dose?: string | null
          child_dose?: string | null
          created_at?: string
          hepatic_adjustment?: string | null
          max_daily_dose?: string | null
          medicine_id?: string
          renal_adjustment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_dosage_guides_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: true
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_drug_interactions: {
        Row: {
          clinical_effect: string | null
          created_at: string
          description: string | null
          id: string
          medicine_a: string
          medicine_b: string
          recommendation: string | null
          severity: Database["public"]["Enums"]["drug_interaction_severity"]
          updated_at: string
        }
        Insert: {
          clinical_effect?: string | null
          created_at?: string
          description?: string | null
          id?: string
          medicine_a: string
          medicine_b: string
          recommendation?: string | null
          severity: Database["public"]["Enums"]["drug_interaction_severity"]
          updated_at?: string
        }
        Update: {
          clinical_effect?: string | null
          created_at?: string
          description?: string | null
          id?: string
          medicine_a?: string
          medicine_b?: string
          recommendation?: string | null
          severity?: Database["public"]["Enums"]["drug_interaction_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_drug_interactions_medicine_a_fkey"
            columns: ["medicine_a"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_drug_interactions_medicine_b_fkey"
            columns: ["medicine_b"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_generics: {
        Row: {
          atc_code: string | null
          created_at: string
          id: string
          name: string
          therapeutic_class: string | null
          updated_at: string
        }
        Insert: {
          atc_code?: string | null
          created_at?: string
          id?: string
          name: string
          therapeutic_class?: string | null
          updated_at?: string
        }
        Update: {
          atc_code?: string | null
          created_at?: string
          id?: string
          name?: string
          therapeutic_class?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      global_manufacturers: {
        Row: {
          code: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      global_match_reviews: {
        Row: {
          confidence: number
          created_at: string
          id: string
          match_level: number
          notes: string | null
          product_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_global_medicine_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          match_level?: number
          notes?: string | null
          product_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_global_medicine_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          match_level?: number
          notes?: string | null
          product_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_global_medicine_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_match_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_match_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_match_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_match_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_match_reviews_suggested_global_medicine_id_fkey"
            columns: ["suggested_global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_match_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicine_adoptions: {
        Row: {
          adopted_at: string
          adopted_by: string | null
          global_medicine_id: string
          id: string
          product_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          adopted_at?: string
          adopted_by?: string | null
          global_medicine_id: string
          id?: string
          product_id?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          adopted_at?: string
          adopted_by?: string | null
          global_medicine_id?: string
          id?: string
          product_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_medicine_adoptions_global_medicine_id_fkey"
            columns: ["global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicine_aliases: {
        Row: {
          alias: string
          created_at: string
          global_medicine_id: string
          id: string
          lang: string
        }
        Insert: {
          alias: string
          created_at?: string
          global_medicine_id: string
          id?: string
          lang?: string
        }
        Update: {
          alias?: string
          created_at?: string
          global_medicine_id?: string
          id?: string
          lang?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_medicine_aliases_global_medicine_id_fkey"
            columns: ["global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicine_alternatives: {
        Row: {
          alternative_medicine_id: string
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          generic_match: boolean
          id: string
          notes: string | null
          source_medicine_id: string
          strength_match: boolean
          therapeutic_match: boolean
        }
        Insert: {
          alternative_medicine_id: string
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          generic_match?: boolean
          id?: string
          notes?: string | null
          source_medicine_id: string
          strength_match?: boolean
          therapeutic_match?: boolean
        }
        Update: {
          alternative_medicine_id?: string
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          generic_match?: boolean
          id?: string
          notes?: string | null
          source_medicine_id?: string
          strength_match?: boolean
          therapeutic_match?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "global_medicine_alternatives_alternative_medicine_id_fkey"
            columns: ["alternative_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicine_alternatives_source_medicine_id_fkey"
            columns: ["source_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicine_contributions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string | null
          proposed_data: Json
          resulting_medicine_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["contribution_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          proposed_data: Json
          resulting_medicine_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          proposed_data?: Json
          resulting_medicine_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_medicine_contributions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicine_contributions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_medicine_contributions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_medicine_contributions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "global_medicine_contributions_resulting_medicine_id_fkey"
            columns: ["resulting_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicine_contributions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicine_therapeutic_classes: {
        Row: {
          created_at: string
          medicine_id: string
          therapeutic_class_id: string
        }
        Insert: {
          created_at?: string
          medicine_id: string
          therapeutic_class_id: string
        }
        Update: {
          created_at?: string
          medicine_id?: string
          therapeutic_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_medicine_therapeutic_classes_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicine_therapeutic_classes_therapeutic_class_id_fkey"
            columns: ["therapeutic_class_id"]
            isOneToOne: false
            referencedRelation: "global_therapeutic_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      global_medicines: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          atc_code: string | null
          brand_name: string
          created_at: string
          created_by_tenant: string | null
          description: string | null
          dosage_form: string | null
          generic_id: string | null
          generic_name_cached: string | null
          geriatric_warning: string | null
          id: string
          lactation_warning: string | null
          manufacturer_id: string | null
          manufacturer_name_cached: string | null
          otc_allowed: boolean
          pediatric_warning: string | null
          pregnancy_category: string | null
          prescription_required: boolean
          route: string | null
          search_tsv: unknown
          strength: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          atc_code?: string | null
          brand_name: string
          created_at?: string
          created_by_tenant?: string | null
          description?: string | null
          dosage_form?: string | null
          generic_id?: string | null
          generic_name_cached?: string | null
          geriatric_warning?: string | null
          id?: string
          lactation_warning?: string | null
          manufacturer_id?: string | null
          manufacturer_name_cached?: string | null
          otc_allowed?: boolean
          pediatric_warning?: string | null
          pregnancy_category?: string | null
          prescription_required?: boolean
          route?: string | null
          search_tsv?: unknown
          strength?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          atc_code?: string | null
          brand_name?: string
          created_at?: string
          created_by_tenant?: string | null
          description?: string | null
          dosage_form?: string | null
          generic_id?: string | null
          generic_name_cached?: string | null
          geriatric_warning?: string | null
          id?: string
          lactation_warning?: string | null
          manufacturer_id?: string | null
          manufacturer_name_cached?: string | null
          otc_allowed?: boolean
          pediatric_warning?: string | null
          pregnancy_category?: string | null
          prescription_required?: boolean
          route?: string | null
          search_tsv?: unknown
          strength?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_medicines_created_by_tenant_fkey"
            columns: ["created_by_tenant"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicines_generic_id_fkey"
            columns: ["generic_id"]
            isOneToOne: false
            referencedRelation: "global_generics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_medicines_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "global_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      global_packs: {
        Row: {
          created_at: string
          global_medicine_id: string
          id: string
          mrp: number | null
          pack_size: string
          units_per_pack: number | null
        }
        Insert: {
          created_at?: string
          global_medicine_id: string
          id?: string
          mrp?: number | null
          pack_size: string
          units_per_pack?: number | null
        }
        Update: {
          created_at?: string
          global_medicine_id?: string
          id?: string
          mrp?: number | null
          pack_size?: string
          units_per_pack?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "global_packs_global_medicine_id_fkey"
            columns: ["global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_therapeutic_classes: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      goods_receipt_items: {
        Row: {
          batch_id: string | null
          batch_no: string
          branch_id: string
          created_at: string
          expiry_date: string
          grn_id: string
          id: string
          line_total: number
          mfg_date: string | null
          po_item_id: string
          product_id: string
          qty_received: number
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          batch_id?: string | null
          batch_no: string
          branch_id: string
          created_at?: string
          expiry_date: string
          grn_id: string
          id?: string
          line_total?: number
          mfg_date?: string | null
          po_item_id: string
          product_id: string
          qty_received: number
          tenant_id: string
          unit_cost?: number
        }
        Update: {
          batch_id?: string | null
          batch_no?: string
          branch_id?: string
          created_at?: string
          expiry_date?: string
          grn_id?: string
          id?: string
          line_total?: number
          mfg_date?: string | null
          po_item_id?: string
          product_id?: string
          qty_received?: number
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_vat_register"
            referencedColumns: ["grn_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          client_op_id: string | null
          created_at: string
          grn_no: string
          id: string
          notes: string | null
          po_id: string
          received_at: string
          received_by: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          client_op_id?: string | null
          created_at?: string
          grn_no: string
          id?: string
          notes?: string | null
          po_id: string
          received_at?: string
          received_by?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          client_op_id?: string | null
          created_at?: string
          grn_no?: string
          id?: string
          notes?: string | null
          po_id?: string
          received_at?: string
          received_by?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      held_sales: {
        Row: {
          branch_id: string | null
          cart: Json
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          held_by: string | null
          id: string
          label: string | null
          resumed_at: string | null
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          cart: Json
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          held_by?: string | null
          id?: string
          label?: string | null
          resumed_at?: string | null
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          cart?: Json
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          held_by?: string | null
          id?: string
          label?: string | null
          resumed_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "held_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "held_sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audit: {
        Row: {
          actor: string | null
          created_at: string
          detail: Json | null
          from_status: string | null
          id: number
          job_id: string
          tenant_id: string
          to_status: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          from_status?: string | null
          id?: number
          job_id: string
          tenant_id: string
          to_status: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          from_status?: string | null
          id?: number
          job_id?: string
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      import_errors_v2: {
        Row: {
          column_name: string | null
          created_at: string
          error_code: string | null
          error_message: string
          id: number
          job_id: string
          product_name: string | null
          raw: Json | null
          reason: string | null
          row_number: number
          suggested_fix: string | null
          tenant_id: string
        }
        Insert: {
          column_name?: string | null
          created_at?: string
          error_code?: string | null
          error_message: string
          id?: number
          job_id: string
          product_name?: string | null
          raw?: Json | null
          reason?: string | null
          row_number: number
          suggested_fix?: string | null
          tenant_id: string
        }
        Update: {
          column_name?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          id?: number
          job_id?: string
          product_name?: string | null
          raw?: Json | null
          reason?: string | null
          row_number?: number
          suggested_fix?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_v2_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          branch_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          filter_q: string | null
          filter_rx_only: boolean | null
          id: string
          job_type: string
          medicine_ids: string[]
          options: Json
          processed_items: number
          scope: string
          skipped_count: number
          started_at: string | null
          status: string
          success_count: number
          tenant_id: string
          total_items: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          filter_q?: string | null
          filter_rx_only?: boolean | null
          id?: string
          job_type?: string
          medicine_ids?: string[]
          options?: Json
          processed_items?: number
          scope?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          success_count?: number
          tenant_id: string
          total_items?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          filter_q?: string | null
          filter_rx_only?: boolean | null
          id?: string
          job_type?: string
          medicine_ids?: string[]
          options?: Json
          processed_items?: number
          scope?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          success_count?: number
          tenant_id?: string
          total_items?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs_v2: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          cursor_row: number
          duration_ms: number | null
          error_message: string | null
          failed_rows: number
          file_name: string
          file_path: string
          finished_at: string | null
          id: string
          imported_rows: number
          mapping: Json
          options: Json
          parsed_rows: number
          quality_report: Json
          rolled_back_at: string | null
          skipped_rows: number
          started_at: string | null
          status: string
          tenant_id: string
          total_rows: number
          updated_at: string
          updated_rows: number
          vendor: string | null
        }
        Insert: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          cursor_row?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_rows?: number
          file_name: string
          file_path: string
          finished_at?: string | null
          id?: string
          imported_rows?: number
          mapping?: Json
          options?: Json
          parsed_rows?: number
          quality_report?: Json
          rolled_back_at?: string | null
          skipped_rows?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          vendor?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          cursor_row?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_rows?: number
          file_name?: string
          file_path?: string
          finished_at?: string | null
          id?: string
          imported_rows?: number
          mapping?: Json
          options?: Json
          parsed_rows?: number
          quality_report?: Json
          rolled_back_at?: string | null
          skipped_rows?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mapping: Json
          name: string
          tenant_id: string
          updated_at: string
          vendor: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapping: Json
          name: string
          tenant_id: string
          updated_at?: string
          vendor: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapping?: Json
          name?: string
          tenant_id?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_master_diff: {
        Row: {
          approved: boolean
          created_at: string
          id: number
          job_id: string
          kind: string
          match_status: string
          normalized_value: string
          occurrences: number
          raw_value: string
          target_id: string | null
          tenant_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          id?: number
          job_id: string
          kind: string
          match_status: string
          normalized_value: string
          occurrences?: number
          raw_value: string
          target_id?: string | null
          tenant_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          id?: number
          job_id?: string
          kind?: string
          match_status?: string
          normalized_value?: string
          occurrences?: number
          raw_value?: string
          target_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_master_diff_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      import_staging_rows: {
        Row: {
          created_at: string
          field_errors: Json
          id: number
          job_id: string
          normalized: Json
          parsed: Json
          product_id: string | null
          raw: Json
          row_number: number
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          field_errors?: Json
          id?: number
          job_id: string
          normalized?: Json
          parsed?: Json
          product_id?: string | null
          raw: Json
          row_number: number
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          field_errors?: Json
          id?: number
          job_id?: string
          normalized?: Json
          parsed?: Json
          product_id?: string | null
          raw?: Json
          row_number?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      incomes: {
        Row: {
          account_id: string
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          income_date: string
          income_no: string
          journal_id: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["fin_payment_method"]
          reference_no: string | null
          source: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          income_no: string
          journal_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["fin_payment_method"]
          reference_no?: string | null
          source?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          income_no?: string
          journal_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["fin_payment_method"]
          reference_no?: string | null
          source?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incomes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "incomes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "incomes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance_by_warehouse"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "incomes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "incomes_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["journal_id"]
          },
          {
            foreignKeyName: "incomes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          category: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          provider: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_revaluation_log: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          new_cost: number
          old_cost: number
          reason: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_cost: number
          old_cost: number
          reason: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_cost?: number
          old_cost?: number
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_revaluation_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_revaluation_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inventory_revaluation_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inventory_revaluation_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      invoice_edit_history: {
        Row: {
          edited_at: string
          edited_by: string | null
          id: string
          invoice_no: string
          new_due: number
          new_items: Json
          new_paid: number
          new_total: number
          old_due: number
          old_items: Json
          old_paid: number
          old_total: number
          reason: string | null
          sale_id: string
          tenant_id: string
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          invoice_no: string
          new_due?: number
          new_items?: Json
          new_paid?: number
          new_total?: number
          old_due?: number
          old_items?: Json
          old_paid?: number
          old_total?: number
          reason?: string | null
          sale_id: string
          tenant_id: string
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          invoice_no?: string
          new_due?: number
          new_items?: Json
          new_paid?: number
          new_total?: number
          old_due?: number
          old_items?: Json
          old_paid?: number
          old_total?: number
          reason?: string | null
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_edit_history_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_edit_history_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      invoice_print_logs: {
        Row: {
          created_at: string
          format: string
          id: string
          invoice_no: string
          payment_id: string | null
          printed_by: string | null
          return_id: string | null
          sale_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          format: string
          id?: string
          invoice_no: string
          payment_id?: string | null
          printed_by?: string | null
          return_id?: string | null
          sale_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          invoice_no?: string
          payment_id?: string | null
          printed_by?: string | null
          return_id?: string | null
          sale_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_print_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_print_logs_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_print_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_print_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "invoice_print_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          address: string | null
          bin_number: string | null
          branch_id: string | null
          company_name: string
          created_at: string
          drug_license: string | null
          email: string | null
          font_family: string | null
          footer_message: string | null
          id: string
          invoice_prefix: string
          logo_url: string | null
          phone: string | null
          primary_color: string | null
          print_format: string
          receipt_prefix: string
          show_barcode: boolean | null
          show_bin: boolean
          show_drug_license: boolean
          show_logo: boolean
          show_qr: boolean | null
          show_signature: boolean
          show_tin: boolean
          starting_number: number
          template: string
          tenant_id: string
          terms_conditions: string | null
          thermal_width: string
          tin_number: string | null
          trade_license: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bin_number?: string | null
          branch_id?: string | null
          company_name?: string
          created_at?: string
          drug_license?: string | null
          email?: string | null
          font_family?: string | null
          footer_message?: string | null
          id?: string
          invoice_prefix?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string | null
          print_format?: string
          receipt_prefix?: string
          show_barcode?: boolean | null
          show_bin?: boolean
          show_drug_license?: boolean
          show_logo?: boolean
          show_qr?: boolean | null
          show_signature?: boolean
          show_tin?: boolean
          starting_number?: number
          template?: string
          tenant_id: string
          terms_conditions?: string | null
          thermal_width?: string
          tin_number?: string | null
          trade_license?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bin_number?: string | null
          branch_id?: string | null
          company_name?: string
          created_at?: string
          drug_license?: string | null
          email?: string | null
          font_family?: string | null
          footer_message?: string | null
          id?: string
          invoice_prefix?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string | null
          print_format?: string
          receipt_prefix?: string
          show_barcode?: boolean | null
          show_bin?: boolean
          show_drug_license?: boolean
          show_logo?: boolean
          show_qr?: boolean | null
          show_signature?: boolean
          show_tin?: boolean
          starting_number?: number
          template?: string
          tenant_id?: string
          terms_conditions?: string | null
          thermal_width?: string
          tin_number?: string | null
          trade_license?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "invoice_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_share_logs: {
        Row: {
          channel: string
          created_at: string
          id: string
          invoice_no: string
          payment_id: string | null
          recipient: string | null
          return_id: string | null
          sale_id: string | null
          shared_by: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          invoice_no: string
          payment_id?: string | null
          recipient?: string | null
          return_id?: string | null
          sale_id?: string | null
          shared_by?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          invoice_no?: string
          payment_id?: string | null
          recipient?: string | null
          return_id?: string | null
          sale_id?: string | null
          shared_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_share_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_share_logs_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_share_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_share_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "invoice_share_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_failures: {
        Row: {
          created_at: string
          error: string
          id: string
          job_ref: string | null
          job_type: string
          payload: Json
          resolved_at: string | null
          retry_count: number
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error: string
          id?: string
          job_ref?: string | null
          job_type: string
          payload?: Json
          resolved_at?: string | null
          retry_count?: number
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string
          id?: string
          job_ref?: string | null
          job_type?: string
          payload?: Json
          resolved_at?: string | null
          retry_count?: number
          tenant_id?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          branch_id: string
          created_at: string
          entry_date: string
          entry_no: string
          id: string
          is_reversal: boolean
          journal_no: string | null
          notes: string | null
          posted: boolean
          posted_by: string | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          reversal_reason: string | null
          reversed_journal_id: string | null
          tenant_id: string
          total_credit: number
          total_debit: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          entry_date?: string
          entry_no: string
          id?: string
          is_reversal?: boolean
          journal_no?: string | null
          notes?: string | null
          posted?: boolean
          posted_by?: string | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          reversal_reason?: string | null
          reversed_journal_id?: string | null
          tenant_id: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          entry_date?: string
          entry_no?: string
          id?: string
          is_reversal?: boolean
          journal_no?: string | null
          notes?: string | null
          posted?: boolean
          posted_by?: string | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          reversal_reason?: string | null
          reversed_journal_id?: string | null
          tenant_id?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_journal_id_fkey"
            columns: ["reversed_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_journal_id_fkey"
            columns: ["reversed_journal_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["journal_id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          branch_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_id: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          branch_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_id: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          branch_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance_by_warehouse"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["journal_id"]
          },
          {
            foreignKeyName: "journal_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_cms: {
        Row: {
          content_bn: Json
          content_en: Json
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_bn?: Json
          content_en?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_bn?: Json
          content_en?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string | null
          status: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      manufacturers: {
        Row: {
          address: string | null
          aliases: string[]
          branch_id: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          aliases?: string[]
          branch_id?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          aliases?: string[]
          branch_id?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manufacturers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "manufacturers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          id: number
          master_id: string | null
          master_kind: string
          occurred_at: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          id?: number
          master_id?: string | null
          master_kind: string
          occurred_at?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          id?: number
          master_id?: string | null
          master_kind?: string
          occurred_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      master_merge_history: {
        Row: {
          affected_rows: number
          id: number
          master_kind: string
          merged_at: string
          merged_by: string | null
          source_id: string
          source_snapshot: Json | null
          target_id: string
          tenant_id: string
        }
        Insert: {
          affected_rows?: number
          id?: number
          master_kind: string
          merged_at?: string
          merged_by?: string | null
          source_id: string
          source_snapshot?: Json | null
          target_id: string
          tenant_id: string
        }
        Update: {
          affected_rows?: number
          id?: number
          master_kind?: string
          merged_at?: string
          merged_by?: string | null
          source_id?: string
          source_snapshot?: Json | null
          target_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      medicine_types: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicine_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          recipient: string | null
          sent_at: string | null
          status: string
          subject: string | null
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          categories: Json
          digest_enabled: boolean
          email_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          categories?: Json
          digest_enabled?: boolean
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          categories?: Json
          digest_enabled?: boolean
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          data: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          severity: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          severity?: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      number_series_counters: {
        Row: {
          current_value: number
          doc_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          current_value?: number
          doc_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          current_value?: number
          doc_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_series_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      party_ledger: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          entry_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          notes: string | null
          party_id: string
          party_type: Database["public"]["Enums"]["party_type"]
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          entry_date?: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          notes?: string | null
          party_id: string
          party_type: Database["public"]["Enums"]["party_type"]
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          notes?: string | null
          party_id?: string
          party_type?: Database["public"]["Enums"]["party_type"]
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "party_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          blood_group: string | null
          chronic_conditions: Json
          created_at: string
          dob: string | null
          full_name: string
          gender: string | null
          id: string
          is_pregnant: boolean
          linked_customer_id: string | null
          medical_history: string | null
          patient_code: string | null
          phone: string | null
          pregnancy_weeks: number | null
          tenant_id: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          chronic_conditions?: Json
          created_at?: string
          dob?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_pregnant?: boolean
          linked_customer_id?: string | null
          medical_history?: string | null
          patient_code?: string | null
          phone?: string | null
          pregnancy_weeks?: number | null
          tenant_id: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          chronic_conditions?: Json
          created_at?: string
          dob?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_pregnant?: boolean
          linked_customer_id?: string | null
          medical_history?: string | null
          patient_code?: string | null
          phone?: string | null
          pregnancy_weeks?: number | null
          tenant_id?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "patients_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "patients_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "patients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          api_key: string | null
          created_at: string
          created_by: string | null
          id: string
          merchant_id: string | null
          provider: string
          sandbox: boolean
          secret_key: string | null
          status: string
          tenant_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_id?: string | null
          provider: string
          sandbox?: boolean
          secret_key?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_id?: string | null
          provider?: string
          sandbox?: boolean
          secret_key?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          amount: number
          created_at: string
          fees: number
          gateway_id: string | null
          id: string
          net_amount: number
          provider: string
          reference: string | null
          settled_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fees?: number
          gateway_id?: string | null
          id?: string
          net_amount?: number
          provider: string
          reference?: string | null
          settled_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fees?: number
          gateway_id?: string | null
          id?: string
          net_amount?: number
          provider?: string
          reference?: string | null
          settled_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          paid_at: string | null
          plan_id: string | null
          provider: string
          provider_txn_id: string | null
          status: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          plan_id?: string | null
          provider: string
          provider_txn_id?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          plan_id?: string | null
          provider?: string
          provider_txn_id?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      plan_pricing: {
        Row: {
          billing_cycle: string
          created_at: string
          discount_percent: number
          duration_days: number
          id: string
          is_active: boolean
          plan_id: string
          price_bdt: number
          updated_at: string
        }
        Insert: {
          billing_cycle: string
          created_at?: string
          discount_percent?: number
          duration_days: number
          id?: string
          is_active?: boolean
          plan_id: string
          price_bdt: number
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          discount_percent?: number
          duration_days?: number
          id?: string
          is_active?: boolean
          plan_id?: string
          price_bdt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_pricing_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          api_enabled: boolean
          billing_interval: string
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_unlimited: boolean
          max_api_requests_per_month: number | null
          max_branches: number | null
          max_products: number | null
          max_storage_mb: number | null
          max_users: number | null
          max_warehouses: number | null
          name: string
          payment_methods: Json
          price_bdt: number
          price_yearly_bdt: number | null
          slug: string
          sms_enabled: boolean
          sort_order: number
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          api_enabled?: boolean
          billing_interval?: string
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_unlimited?: boolean
          max_api_requests_per_month?: number | null
          max_branches?: number | null
          max_products?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          max_warehouses?: number | null
          name: string
          payment_methods?: Json
          price_bdt?: number
          price_yearly_bdt?: number | null
          slug: string
          sms_enabled?: boolean
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          api_enabled?: boolean
          billing_interval?: string
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_unlimited?: boolean
          max_api_requests_per_month?: number | null
          max_branches?: number | null
          max_products?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          max_warehouses?: number | null
          name?: string
          payment_methods?: Json
          price_bdt?: number
          price_yearly_bdt?: number | null
          slug?: string
          sms_enabled?: boolean
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      prescription_items: {
        Row: {
          branch_id: string
          brand_name: string | null
          confidence: number
          created_at: string
          dosage: string | null
          duration_days: number | null
          frequency: string | null
          fulfilled_qty: number
          generic_name: string | null
          id: string
          interpreted_notes: string | null
          matched_product_id: string | null
          notes: string | null
          prescription_id: string
          quantity: number | null
          raw_text: string
          status: string
          strength: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          brand_name?: string | null
          confidence?: number
          created_at?: string
          dosage?: string | null
          duration_days?: number | null
          frequency?: string | null
          fulfilled_qty?: number
          generic_name?: string | null
          id?: string
          interpreted_notes?: string | null
          matched_product_id?: string | null
          notes?: string | null
          prescription_id: string
          quantity?: number | null
          raw_text: string
          status?: string
          strength?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          brand_name?: string | null
          confidence?: number
          created_at?: string
          dosage?: string | null
          duration_days?: number | null
          frequency?: string | null
          fulfilled_qty?: number
          generic_name?: string | null
          id?: string
          interpreted_notes?: string | null
          matched_product_id?: string | null
          notes?: string | null
          prescription_id?: string
          quantity?: number | null
          raw_text?: string
          status?: string
          strength?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "prescription_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "prescription_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "prescription_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_ocr_jobs: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          detected_medicines: Json | null
          doctor_id: string | null
          error_message: string | null
          id: string
          image_url: string | null
          language: string | null
          matched_medicines: Json | null
          parsed_json: Json | null
          patient_id: string | null
          pharmacist_review_status: string | null
          prescription_id: string | null
          processing_ms: number | null
          provider: string
          provider_fallback_chain: string[] | null
          raw_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detected_medicines?: Json | null
          doctor_id?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          language?: string | null
          matched_medicines?: Json | null
          parsed_json?: Json | null
          patient_id?: string | null
          pharmacist_review_status?: string | null
          prescription_id?: string | null
          processing_ms?: number | null
          provider?: string
          provider_fallback_chain?: string[] | null
          raw_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detected_medicines?: Json | null
          doctor_id?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          language?: string | null
          matched_medicines?: Json | null
          parsed_json?: Json | null
          patient_id?: string | null
          pharmacist_review_status?: string | null
          prescription_id?: string | null
          processing_ms?: number | null
          provider?: string
          provider_fallback_chain?: string[] | null
          raw_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_ocr_jobs_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_ocr_jobs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_ocr_jobs_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_ocr_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_refills: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          customer_id: string | null
          expected_date: string
          id: string
          notes: string | null
          notified_at: string | null
          prescription_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_id?: string | null
          expected_date: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          prescription_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_id?: string | null
          expected_date?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          prescription_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_refills_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_refills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          ai_summary: string | null
          branch_id: string
          confidence_score: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          doctor_id: string | null
          doctor_name: string | null
          expected_refill_date: string | null
          file_kind: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfilled_sale_id: string | null
          fulfillment_status: string
          id: string
          image_path: string | null
          notes: string | null
          ocr_text: string | null
          override_reason: string | null
          patient_name: string | null
          prescription_date: string | null
          refill_notified_at: string | null
          review_status: Database["public"]["Enums"]["rx_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          safety_ack_at: string | null
          safety_ack_severity: string | null
          status: string
          tenant_id: string
          unmatched_count: number
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          branch_id: string
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          doctor_id?: string | null
          doctor_name?: string | null
          expected_refill_date?: string | null
          file_kind?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfilled_sale_id?: string | null
          fulfillment_status?: string
          id?: string
          image_path?: string | null
          notes?: string | null
          ocr_text?: string | null
          override_reason?: string | null
          patient_name?: string | null
          prescription_date?: string | null
          refill_notified_at?: string | null
          review_status?: Database["public"]["Enums"]["rx_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          safety_ack_at?: string | null
          safety_ack_severity?: string | null
          status?: string
          tenant_id: string
          unmatched_count?: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          branch_id?: string
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          doctor_id?: string | null
          doctor_name?: string | null
          expected_refill_date?: string | null
          file_kind?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfilled_sale_id?: string | null
          fulfillment_status?: string
          id?: string
          image_path?: string | null
          notes?: string | null
          ocr_text?: string | null
          override_reason?: string | null
          patient_name?: string | null
          prescription_date?: string | null
          refill_notified_at?: string | null
          review_status?: Database["public"]["Enums"]["rx_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          safety_ack_at?: string | null
          safety_ack_severity?: string | null
          status?: string
          tenant_id?: string
          unmatched_count?: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_health_log: {
        Row: {
          branch_id: string | null
          detail: string | null
          id: string
          latency_ms: number | null
          printer_name: string
          recorded_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          detail?: string | null
          id?: string
          latency_ms?: number | null
          printer_name: string
          recorded_at?: string
          status: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          detail?: string | null
          id?: string
          latency_ms?: number | null
          printer_name?: string
          recorded_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_health_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_health_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "print_health_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          branch_id: string | null
          completed_at: string | null
          copies: number
          created_at: string
          dedupe_key: string | null
          document_id: string | null
          document_type: string
          duration_ms: number | null
          engine: string
          failure_reason: string | null
          id: string
          paper_width_mm: number
          payload: Json | null
          printer_name: string | null
          printer_profile_id: string | null
          priority: number
          started_at: string | null
          status: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          branch_id?: string | null
          completed_at?: string | null
          copies?: number
          created_at?: string
          dedupe_key?: string | null
          document_id?: string | null
          document_type: string
          duration_ms?: number | null
          engine: string
          failure_reason?: string | null
          id?: string
          paper_width_mm?: number
          payload?: Json | null
          printer_name?: string | null
          printer_profile_id?: string | null
          priority?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          branch_id?: string | null
          completed_at?: string | null
          copies?: number
          created_at?: string
          dedupe_key?: string | null
          document_id?: string | null
          document_type?: string
          duration_ms?: number | null
          engine?: string
          failure_reason?: string | null
          id?: string
          paper_width_mm?: number
          payload?: Json | null
          printer_name?: string | null
          printer_profile_id?: string | null
          priority?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "print_jobs_printer_profile_id_fkey"
            columns: ["printer_profile_id"]
            isOneToOne: false
            referencedRelation: "printing_printer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_templates: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          template_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
          template_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          template_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_profiles: {
        Row: {
          branch_id: string | null
          connection: Json
          created_at: string
          created_by: string | null
          driver: string | null
          id: string
          name: string
          paper_size: string | null
          printer_type: string
          status: string
          tenant_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          connection?: Json
          created_at?: string
          created_by?: string | null
          driver?: string | null
          id?: string
          name: string
          paper_size?: string | null
          printer_type: string
          status?: string
          tenant_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          connection?: Json
          created_at?: string
          created_by?: string | null
          driver?: string | null
          id?: string
          name?: string
          paper_size?: string | null
          printer_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "printer_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_profiles_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      printing_label_templates: {
        Row: {
          body: string
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          kind: string
          language: string
          name: string
          paper_height_mm: number
          paper_width_mm: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind: string
          language?: string
          name: string
          paper_height_mm?: number
          paper_width_mm?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind?: string
          language?: string
          name?: string
          paper_height_mm?: number
          paper_width_mm?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printing_label_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printing_label_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printing_label_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printing_printer_profiles: {
        Row: {
          auto_detected: boolean
          branch_id: string | null
          created_at: string
          custom_height_mm: number | null
          custom_width_mm: number | null
          id: string
          is_default: boolean
          language: string
          name: string
          notes: string | null
          paper_width_mm: number
          printer_role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_detected?: boolean
          branch_id?: string | null
          created_at?: string
          custom_height_mm?: number | null
          custom_width_mm?: number | null
          id?: string
          is_default?: boolean
          language?: string
          name: string
          notes?: string | null
          paper_width_mm?: number
          printer_role: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_detected?: boolean
          branch_id?: string | null
          created_at?: string
          custom_height_mm?: number | null
          custom_width_mm?: number | null
          id?: string
          is_default?: boolean
          language?: string
          name?: string
          notes?: string | null
          paper_width_mm?: number
          printer_role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printing_printer_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printing_printer_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printing_printer_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printing_settings: {
        Row: {
          auto_connect: boolean
          auto_print: boolean
          branch_id: string | null
          copies: number
          created_at: string
          engine: string
          fallback_enabled: boolean
          id: string
          paper_width_mm: number
          printer_language: string
          printing_v2_enabled: boolean
          silent_print: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_connect?: boolean
          auto_print?: boolean
          branch_id?: string | null
          copies?: number
          created_at?: string
          engine?: string
          fallback_enabled?: boolean
          id?: string
          paper_width_mm?: number
          printer_language?: string
          printing_v2_enabled?: boolean
          silent_print?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_connect?: boolean
          auto_print?: boolean
          branch_id?: string | null
          copies?: number
          created_at?: string
          engine?: string
          fallback_enabled?: boolean
          id?: string
          paper_width_mm?: number
          printer_language?: string
          printing_v2_enabled?: boolean
          silent_print?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printing_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printing_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printing_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          barcode_type: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          is_primary: boolean
          label_size: string | null
          product_id: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          barcode: string
          barcode_type?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_primary?: boolean
          label_size?: string | null
          product_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          barcode?: string
          barcode_type?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_primary?: boolean
          label_size?: string | null
          product_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_errors: {
        Row: {
          barcode: string | null
          branch_id: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          error_message: string
          id: string
          import_log_id: string
          product_name: string | null
          raw_data: Json
          row_number: number
          tenant_id: string
        }
        Insert: {
          barcode?: string | null
          branch_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          error_message: string
          id?: string
          import_log_id: string
          product_name?: string | null
          raw_data?: Json
          row_number: number
          tenant_id: string
        }
        Update: {
          barcode?: string | null
          branch_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string
          id?: string
          import_log_id?: string
          product_name?: string | null
          raw_data?: Json
          row_number?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_errors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_errors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "product_import_errors_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "product_import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_errors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_logs: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration_ms: number | null
          failed_rows: number
          file_name: string
          finished_at: string | null
          id: string
          import_batch_id: string | null
          imported_rows: number
          rolled_back_at: string | null
          rolled_back_by: string | null
          skipped_rows: number
          started_at: string
          status: string
          tenant_id: string
          total_rows: number
          updated_at: string
          updated_by: string | null
          updated_rows: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_ms?: number | null
          failed_rows?: number
          file_name: string
          finished_at?: string | null
          id?: string
          import_batch_id?: string | null
          imported_rows?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number
          started_at?: string
          status?: string
          tenant_id: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          updated_rows?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_ms?: number | null
          failed_rows?: number
          file_name?: string
          finished_at?: string | null
          id?: string
          import_batch_id?: string | null
          imported_rows?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number
          started_at?: string
          status?: string
          tenant_id?: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          updated_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_import_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "product_import_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost: number
          barcode: string | null
          base_unit: string
          branch_id: string | null
          category_id: string | null
          country_id: string | null
          country_of_origin: string | null
          created_at: string
          created_by: string | null
          dealer_price: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          dosage_form_id: string | null
          generic_id: string | null
          global_medicine_id: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          is_prescription_required: boolean
          manufacturer_id: string | null
          medicine_type: string | null
          medicine_type_id: string | null
          mrp: number
          name: string
          name_bn: string | null
          notes: string | null
          opening_stock: number
          pack_size: number
          purchase_price: number
          purchase_unit: string
          qty_per_box: number
          rack_number: string | null
          reorder_level: number
          retail_price: number
          sale_unit: string
          sku: string
          status: string
          strength: string | null
          tax_class_id: string | null
          tenant_id: string
          therapeutic_class_id: string | null
          track_batch: boolean
          track_expiry: boolean
          unit: string
          unit_id: string | null
          units_per_purchase: number
          units_per_sale: number
          updated_at: string
          updated_by: string | null
          vat_mode: string
          vat_rate: number
          volume: string | null
          wholesale_price: number
        }
        Insert: {
          average_cost?: number
          barcode?: string | null
          base_unit?: string
          branch_id?: string | null
          category_id?: string | null
          country_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          dealer_price?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          dosage_form_id?: string | null
          generic_id?: string | null
          global_medicine_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_prescription_required?: boolean
          manufacturer_id?: string | null
          medicine_type?: string | null
          medicine_type_id?: string | null
          mrp?: number
          name: string
          name_bn?: string | null
          notes?: string | null
          opening_stock?: number
          pack_size?: number
          purchase_price?: number
          purchase_unit?: string
          qty_per_box?: number
          rack_number?: string | null
          reorder_level?: number
          retail_price?: number
          sale_unit?: string
          sku: string
          status?: string
          strength?: string | null
          tax_class_id?: string | null
          tenant_id: string
          therapeutic_class_id?: string | null
          track_batch?: boolean
          track_expiry?: boolean
          unit?: string
          unit_id?: string | null
          units_per_purchase?: number
          units_per_sale?: number
          updated_at?: string
          updated_by?: string | null
          vat_mode?: string
          vat_rate?: number
          volume?: string | null
          wholesale_price?: number
        }
        Update: {
          average_cost?: number
          barcode?: string | null
          base_unit?: string
          branch_id?: string | null
          category_id?: string | null
          country_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          dealer_price?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          dosage_form_id?: string | null
          generic_id?: string | null
          global_medicine_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_prescription_required?: boolean
          manufacturer_id?: string | null
          medicine_type?: string | null
          medicine_type_id?: string | null
          mrp?: number
          name?: string
          name_bn?: string | null
          notes?: string | null
          opening_stock?: number
          pack_size?: number
          purchase_price?: number
          purchase_unit?: string
          qty_per_box?: number
          rack_number?: string | null
          reorder_level?: number
          retail_price?: number
          sale_unit?: string
          sku?: string
          status?: string
          strength?: string | null
          tax_class_id?: string | null
          tenant_id?: string
          therapeutic_class_id?: string | null
          track_batch?: boolean
          track_expiry?: boolean
          unit?: string
          unit_id?: string | null
          units_per_purchase?: number
          units_per_sale?: number
          updated_at?: string
          updated_by?: string | null
          vat_mode?: string
          vat_rate?: number
          volume?: string | null
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_dosage_form_id_fkey"
            columns: ["dosage_form_id"]
            isOneToOne: false
            referencedRelation: "dosage_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_generic_id_fkey"
            columns: ["generic_id"]
            isOneToOne: false
            referencedRelation: "generics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_global_medicine_id_fkey"
            columns: ["global_medicine_id"]
            isOneToOne: false
            referencedRelation: "global_medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_medicine_type_id_fkey"
            columns: ["medicine_type_id"]
            isOneToOne: false
            referencedRelation: "medicine_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tax_class_id_fkey"
            columns: ["tax_class_id"]
            isOneToOne: false
            referencedRelation: "tax_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_therapeutic_class_id_fkey"
            columns: ["therapeutic_class_id"]
            isOneToOne: false
            referencedRelation: "therapeutic_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
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
          created_at: string
          full_name: string | null
          id: string
          language: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          language?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          batch_id: string | null
          bonus_qty: number
          branch_id: string
          created_at: string
          discount: number
          id: string
          line_total: number
          product_id: string
          purchase_id: string
          qty: number
          returned_qty: number
          tenant_id: string
          unit_cost: number
          vat: number
        }
        Insert: {
          batch_id?: string | null
          bonus_qty?: number
          branch_id: string
          created_at?: string
          discount?: number
          id?: string
          line_total: number
          product_id: string
          purchase_id: string
          qty: number
          returned_qty?: number
          tenant_id: string
          unit_cost: number
          vat?: number
        }
        Update: {
          batch_id?: string | null
          bonus_qty?: number
          branch_id?: string
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          product_id?: string
          purchase_id?: string
          qty?: number
          returned_qty?: number
          tenant_id?: string
          unit_cost?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          branch_id: string
          created_at: string
          discount: number
          id: string
          line_total: number
          notes: string | null
          product_id: string
          purchase_order_id: string
          qty_ordered: number
          qty_received: number
          tenant_id: string
          unit_cost: number
          vat: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          notes?: string | null
          product_id: string
          purchase_order_id: string
          qty_ordered: number
          qty_received?: number
          tenant_id: string
          unit_cost?: number
          vat?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string
          purchase_order_id?: string
          qty_ordered?: number
          qty_received?: number
          tenant_id?: string
          unit_cost?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          discount: number
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          received_at: string | null
          source_quotation_id: string | null
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          tenant_id: string
          total: number
          updated_at: string
          vat: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          received_at?: string | null
          source_quotation_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id: string
          total?: number
          updated_at?: string
          vat?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          received_at?: string | null
          source_quotation_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id?: string
          total?: number
          updated_at?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_orders_source_quotation_fkey"
            columns: ["source_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_items: {
        Row: {
          barcode: string | null
          created_at: string
          current_stock: number
          estimated_cost: number
          generic_name: string | null
          id: string
          last_purchase_price: number
          product_id: string | null
          product_name: string
          remarks: string | null
          reorder_level: number
          requested_qty: number
          requisition_id: string
          sku: string | null
          tenant_id: string
          unit: string | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          current_stock?: number
          estimated_cost?: number
          generic_name?: string | null
          id?: string
          last_purchase_price?: number
          product_id?: string | null
          product_name: string
          remarks?: string | null
          reorder_level?: number
          requested_qty?: number
          requisition_id: string
          sku?: string | null
          tenant_id: string
          unit?: string | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          current_stock?: number
          estimated_cost?: number
          generic_name?: string | null
          id?: string
          last_purchase_price?: number
          product_id?: string | null
          product_name?: string
          remarks?: string | null
          reorder_level?: number
          requested_qty?: number
          requisition_id?: string
          sku?: string | null
          tenant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          estimated_amount: number
          expected_date: string | null
          id: string
          pr_number: string
          rejected_reason: string | null
          remarks: string | null
          requisition_date: string
          status: Database["public"]["Enums"]["purchase_requisition_status"]
          supplier_id: string | null
          tenant_id: string
          total_items: number
          total_qty: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          estimated_amount?: number
          expected_date?: string | null
          id?: string
          pr_number: string
          rejected_reason?: string | null
          remarks?: string | null
          requisition_date?: string
          status?: Database["public"]["Enums"]["purchase_requisition_status"]
          supplier_id?: string | null
          tenant_id: string
          total_items?: number
          total_qty?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          estimated_amount?: number
          expected_date?: string | null
          id?: string
          pr_number?: string
          rejected_reason?: string | null
          remarks?: string | null
          requisition_date?: string
          status?: Database["public"]["Enums"]["purchase_requisition_status"]
          supplier_id?: string | null
          tenant_id?: string
          total_items?: number
          total_qty?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchase_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          batch_id: string | null
          branch_id: string
          created_at: string
          id: string
          line_total: number
          product_id: string
          qty: number
          reason: string | null
          return_id: string
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          batch_id?: string | null
          branch_id: string
          created_at?: string
          id?: string
          line_total: number
          product_id: string
          qty: number
          reason?: string | null
          return_id: string
          tenant_id: string
          unit_cost: number
        }
        Update: {
          batch_id?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          qty?: number
          reason?: string | null
          return_id?: string
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_return_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          grn_id: string | null
          id: string
          notes: string | null
          reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          return_date: string
          return_no: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          supplier_id: string | null
          tenant_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          return_date?: string
          return_no: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          supplier_id?: string | null
          tenant_id: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          return_date?: string
          return_no?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          supplier_id?: string | null
          tenant_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_returns_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_vat_register"
            referencedColumns: ["grn_id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchase_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          branch_id: string
          client_op_id: string | null
          created_at: string
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_purchase_id: string | null
          paid: number
          purchase_date: string
          received_by: string | null
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          status: Database["public"]["Enums"]["purchase_status"]
          subtotal: number
          supplier_id: string | null
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        Insert: {
          branch_id: string
          client_op_id?: string | null
          created_at?: string
          discount?: number
          due?: number
          id?: string
          invoice_no: string
          is_return?: boolean
          notes?: string | null
          original_purchase_id?: string | null
          paid?: number
          purchase_date?: string
          received_by?: string | null
          return_reason?: Database["public"]["Enums"]["return_reason"] | null
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id: string
          total?: number
          updated_at?: string
          vat?: number
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string
          client_op_id?: string | null
          created_at?: string
          discount?: number
          due?: number
          id?: string
          invoice_no?: string
          is_return?: boolean
          notes?: string | null
          original_purchase_id?: string | null
          paid?: number
          purchase_date?: string
          received_by?: string | null
          return_reason?: Database["public"]["Enums"]["return_reason"] | null
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id?: string
          total?: number
          updated_at?: string
          vat?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchases_original_purchase_id_fkey"
            columns: ["original_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          available_qty: number | null
          branch_id: string
          created_at: string
          delivery_days: number | null
          id: string
          is_recommended: boolean
          notes: string | null
          product_id: string
          qty: number
          quotation_id: string
          supplier_id: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          available_qty?: number | null
          branch_id: string
          created_at?: string
          delivery_days?: number | null
          id?: string
          is_recommended?: boolean
          notes?: string | null
          product_id: string
          qty: number
          quotation_id: string
          supplier_id?: string | null
          tenant_id: string
          unit_price?: number
        }
        Update: {
          available_qty?: number | null
          branch_id?: string
          created_at?: string
          delivery_days?: number | null
          id?: string
          is_recommended?: boolean
          notes?: string | null
          product_id?: string
          qty?: number
          quotation_id?: string
          supplier_id?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "quotation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          request_date: string
          rfq_number: string
          selected_supplier_id: string | null
          status: Database["public"]["Enums"]["quotation_status"]
          tenant_id: string
          title: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          request_date?: string
          rfq_number: string
          selected_supplier_id?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          tenant_id: string
          title?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          request_date?: string
          rfq_number?: string
          selected_supplier_id?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          tenant_id?: string
          title?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "quotations_selected_supplier_id_fkey"
            columns: ["selected_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_selected_supplier_id_fkey"
            columns: ["selected_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qz_credentials: {
        Row: {
          certificate: string | null
          id: number
          private_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certificate?: string | null
          id?: number
          private_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificate?: string | null
          id?: number
          private_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      registered_devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          is_active: boolean
          last_seen: string
          platform: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          platform?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          platform?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      requisition_items: {
        Row: {
          approved_qty: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          product_id: string
          received_qty: number
          requested_qty: number
          requisition_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_qty?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          received_qty?: number
          requested_qty?: number
          requisition_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_qty?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          received_qty?: number
          requested_qty?: number
          requisition_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisition_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_records: {
        Row: {
          action: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          requisition_id: string
          status_from: string | null
          status_to: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          requisition_id: string
          status_from?: string | null
          status_to?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          requisition_id?: string
          status_from?: string | null
          status_to?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "requisition_records_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          from_branch_id: string | null
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          requisition_no: string
          status: string
          tenant_id: string
          to_branch_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_branch_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requisition_no: string
          status?: string
          tenant_id: string
          to_branch_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_branch_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requisition_no?: string
          status?: string
          tenant_id?: string
          to_branch_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "requisitions_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      restore_history: {
        Row: {
          backup_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          notes: string | null
          restore_type: string
          restored_at: string
          restored_by: string | null
          snapshot_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          backup_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          notes?: string | null
          restore_type?: string
          restored_at?: string
          restored_by?: string | null
          snapshot_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          backup_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          notes?: string | null
          restore_type?: string
          restored_at?: string
          restored_by?: string | null
          snapshot_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_history_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "backup_history"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      royalty_settlements: {
        Row: {
          branch_id: string
          commission_amount: number
          created_at: string
          gross_revenue: number
          id: string
          period_end: string
          period_start: string
          royalty_amount: number
          royalty_percent: number
          settled_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          commission_amount?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          period_end: string
          period_start: string
          royalty_amount?: number
          royalty_percent?: number
          settled_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          commission_amount?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          period_end?: string
          period_start?: string
          royalty_amount?: number
          royalty_percent?: number
          settled_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royalty_settlements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "royalty_settlements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "royalty_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          batch_id: string | null
          branch_id: string
          created_at: string
          discount: number
          id: string
          line_total: number
          product_id: string
          qty: number
          returned_qty: number
          sale_id: string
          taxable_amount: number
          tenant_id: string
          unit_cost: number
          unit_price: number
          vat: number
          vat_method: string
          vat_rate: number
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          branch_id: string
          created_at?: string
          discount?: number
          id?: string
          line_total: number
          product_id: string
          qty: number
          returned_qty?: number
          sale_id: string
          taxable_amount?: number
          tenant_id: string
          unit_cost?: number
          unit_price: number
          vat?: number
          vat_method?: string
          vat_rate?: number
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          branch_id?: string
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          product_id?: string
          qty?: number
          returned_qty?: number
          sale_id?: string
          taxable_amount?: number
          tenant_id?: string
          unit_cost?: number
          unit_price?: number
          vat?: number
          vat_method?: string
          vat_rate?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          mobile_no: string | null
          paid_at: string
          reference: string | null
          sale_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          mobile_no?: string | null
          paid_at?: string
          reference?: string | null
          sale_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          mobile_no?: string | null
          paid_at?: string
          reference?: string | null
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          batch_id: string | null
          branch_id: string
          created_at: string
          id: string
          line_total: number
          product_id: string
          qty: number
          reason: string | null
          return_id: string
          sale_item_id: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          branch_id: string
          created_at?: string
          id?: string
          line_total: number
          product_id: string
          qty: number
          reason?: string | null
          return_id: string
          sale_item_id?: string | null
          tenant_id: string
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          qty?: number
          reason?: string | null
          return_id?: string
          sale_item_id?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_return_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_tax_audit: {
        Row: {
          created_at: string
          direction: string
          id: string
          product_id: string | null
          return_id: string | null
          sale_id: string | null
          sale_item_id: string | null
          source: string
          taxable_amount: number
          tenant_id: string
          vat_amount: number
          vat_method: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          product_id?: string | null
          return_id?: string | null
          sale_id?: string | null
          sale_item_id?: string | null
          source: string
          taxable_amount: number
          tenant_id: string
          vat_amount: number
          vat_method: string
          vat_rate: number
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          product_id?: string | null
          return_id?: string | null
          sale_id?: string | null
          sale_item_id?: string | null
          source?: string
          taxable_amount?: number
          tenant_id?: string
          vat_amount?: number
          vat_method?: string
          vat_rate?: number
        }
        Relationships: []
      }
      sales: {
        Row: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        Insert: {
          branch_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cashier_id?: string | null
          client_op_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          due?: number
          id?: string
          invoice_no: string
          is_return?: boolean
          notes?: string | null
          original_sale_id?: string | null
          paid?: number
          payment_method?: string
          return_reason?: Database["public"]["Enums"]["return_reason"] | null
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          vat?: number
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cashier_id?: string | null
          client_op_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          due?: number
          id?: string
          invoice_no?: string
          is_return?: boolean
          notes?: string | null
          original_sale_id?: string | null
          paid?: number
          payment_method?: string
          return_reason?: Database["public"]["Enums"]["return_reason"] | null
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          vat?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          branch_id: string
          client_op_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          notes: string | null
          reason: string | null
          refund_method: Database["public"]["Enums"]["payment_method"]
          refunded_amount: number
          return_date: string
          return_no: string
          sale_id: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
        }
        Insert: {
          branch_id: string
          client_op_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          refund_method?: Database["public"]["Enums"]["payment_method"]
          refunded_amount?: number
          return_date?: string
          return_no: string
          sale_id?: string | null
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          vat?: number
        }
        Update: {
          branch_id?: string
          client_op_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          refund_method?: Database["public"]["Enums"]["payment_method"]
          refunded_amount?: number
          return_date?: string
          return_no?: string
          sale_id?: string | null
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_vat_register"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string
          filters: Json | null
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          last_status: string | null
          next_run_at: string
          recipients: string[]
          report_type: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          recipients?: string[]
          report_type: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          recipients?: string[]
          report_type?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          detail: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          severity: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          break_minutes: number
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          created_at: string
          id: string
          provider_response: Json | null
          queue_id: string | null
          status: string
          template_code: string | null
          tenant_id: string | null
          to_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          provider_response?: Json | null
          queue_id?: string | null
          status: string
          template_code?: string | null
          tenant_id?: string | null
          to_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          provider_response?: Json | null
          queue_id?: string | null
          status?: string
          template_code?: string | null
          tenant_id?: string | null
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "sms_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          sent_at: string | null
          status: string
          template_code: string
          tenant_id: string | null
          to_number: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          template_code: string
          tenant_id?: string | null
          to_number: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          template_code?: string
          tenant_id?: string | null
          to_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_queue_template_code_fkey"
            columns: ["template_code"]
            isOneToOne: false
            referencedRelation: "sms_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body_bn: string
          body_en: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          variables: Json
        }
        Insert: {
          body_bn: string
          body_en: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_bn?: string
          body_en?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      staff: {
        Row: {
          address: string | null
          allowances: number
          basic_salary: number
          branch_id: string | null
          created_at: string
          designation: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
          join_date: string | null
          national_id: string | null
          notes: string | null
          phone: string | null
          shift_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          allowances?: number
          basic_salary?: number
          branch_id?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name: string
          id?: string
          join_date?: string | null
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          shift_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          allowances?: number
          basic_salary?: number
          branch_id?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          join_date?: string | null
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          shift_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "staff_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          product_id: string
          qty_after: number | null
          qty_change: number
          reference_id: string | null
          reference_no: string | null
          reference_table: string | null
          tenant_id: string
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id: string
          qty_after?: number | null
          qty_change: number
          reference_id?: string | null
          reference_no?: string | null
          reference_table?: string | null
          tenant_id: string
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id?: string
          qty_after?: number | null
          qty_change?: number
          reference_id?: string | null
          reference_no?: string | null
          reference_table?: string | null
          tenant_id?: string
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          batch_id: string | null
          branch_id: string
          id: string
          product_id: string
          qty_received: number
          qty_requested: number
          qty_sent: number
          tenant_id: string
          transfer_id: string
          unit_cost: number
        }
        Insert: {
          batch_id?: string | null
          branch_id: string
          id?: string
          product_id: string
          qty_received?: number
          qty_requested: number
          qty_sent?: number
          tenant_id: string
          transfer_id: string
          unit_cost?: number
        }
        Update: {
          batch_id?: string | null
          branch_id?: string
          id?: string
          product_id?: string
          qty_received?: number
          qty_requested?: number
          qty_sent?: number
          tenant_id?: string
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiry_alert_by_branch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_stock_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          from_branch_id: string
          from_warehouse_id: string | null
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          tenant_id: string
          to_branch_id: string
          to_warehouse_id: string | null
          transfer_no: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          from_branch_id: string
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          tenant_id: string
          to_branch_id: string
          to_warehouse_id?: string | null
          transfer_no: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          from_branch_id?: string
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          tenant_id?: string
          to_branch_id?: string
          to_warehouse_id?: string | null
          transfer_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: string
          from_status: string | null
          id: string
          metadata: Json
          plan_id: string | null
          subscription_id: string
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: string
          from_status?: string | null
          id?: string
          metadata?: Json
          plan_id?: string | null
          subscription_id: string
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          plan_id?: string | null
          subscription_id?: string
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoice_dunning: {
        Row: {
          channel: string
          id: string
          invoice_id: string
          payload: Json | null
          sent_at: string
          stage: string
          tenant_id: string
        }
        Insert: {
          channel: string
          id?: string
          invoice_id: string
          payload?: Json | null
          sent_at?: string
          stage: string
          tenant_id: string
        }
        Update: {
          channel?: string
          id?: string
          invoice_id?: string
          payload?: Json | null
          sent_at?: string
          stage?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoice_dunning_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          metadata: Json
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          metadata?: Json
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          billing_cycle: string
          created_at: string
          created_by: string | null
          currency: string
          discount: number
          due_at: string | null
          duration_days: number
          grand_total: number
          id: string
          invoice_no: string
          kind: string
          metadata: Json
          notes: string | null
          paid_at: string | null
          payment_id: string | null
          period_end: string | null
          period_start: string | null
          plan_id: string | null
          plan_name: string
          status: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
          vat: number
          vat_percent: number
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_at?: string | null
          duration_days?: number
          grand_total?: number
          id?: string
          invoice_no: string
          kind?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          plan_name: string
          status?: string
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
          vat?: number
          vat_percent?: number
        }
        Update: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_at?: string | null
          duration_days?: number
          grand_total?: number
          id?: string
          invoice_no?: string
          kind?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          plan_name?: string
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
          vat?: number
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          auto_renewal_attempted_at: string | null
          billing_cycle: string
          callback_ip: string | null
          callback_nonce: string | null
          callback_processed_at: string | null
          callback_user_agent: string | null
          created_at: string
          currency: string
          gateway: string | null
          gateway_error: string | null
          gateway_payment_id: string | null
          gateway_response: Json | null
          gateway_retry_count: number
          gateway_transaction_id: string | null
          id: string
          method: string
          notes: string | null
          payment_status: string | null
          plan_id: string | null
          processed_at: string | null
          proof_url: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          subscription_id: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          auto_renewal_attempted_at?: string | null
          billing_cycle?: string
          callback_ip?: string | null
          callback_nonce?: string | null
          callback_processed_at?: string | null
          callback_user_agent?: string | null
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_error?: string | null
          gateway_payment_id?: string | null
          gateway_response?: Json | null
          gateway_retry_count?: number
          gateway_transaction_id?: string | null
          id?: string
          method: string
          notes?: string | null
          payment_status?: string | null
          plan_id?: string | null
          processed_at?: string | null
          proof_url?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          auto_renewal_attempted_at?: string | null
          billing_cycle?: string
          callback_ip?: string | null
          callback_nonce?: string | null
          callback_processed_at?: string | null
          callback_user_agent?: string | null
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_error?: string | null
          gateway_payment_id?: string | null
          gateway_response?: Json | null
          gateway_retry_count?: number
          gateway_transaction_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          payment_status?: string | null
          plan_id?: string | null
          processed_at?: string | null
          proof_url?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          billing_cycle: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          expires_at: string | null
          external_ref: string | null
          grace_period_ends_at: string | null
          grace_until: string | null
          id: string
          last_payment_at: string | null
          last_payment_failed_at: string | null
          notes: string | null
          plan_id: string
          scheduled_change_at: string | null
          scheduled_cycle: string | null
          scheduled_plan_id: string | null
          starts_at: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          expires_at?: string | null
          external_ref?: string | null
          grace_period_ends_at?: string | null
          grace_until?: string | null
          id?: string
          last_payment_at?: string | null
          last_payment_failed_at?: string | null
          notes?: string | null
          plan_id: string
          scheduled_change_at?: string | null
          scheduled_cycle?: string | null
          scheduled_plan_id?: string | null
          starts_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          expires_at?: string | null
          external_ref?: string | null
          grace_period_ends_at?: string | null
          grace_until?: string | null
          id?: string
          last_payment_at?: string | null
          last_payment_failed_at?: string | null
          notes?: string | null
          plan_id?: string
          scheduled_change_at?: string | null
          scheduled_cycle?: string | null
          scheduled_plan_id?: string | null
          starts_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_scheduled_plan_id_fkey"
            columns: ["scheduled_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          paid_by: string | null
          payment_date: string
          purchase_id: string | null
          reference: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          purchase_id?: string | null
          reference?: string | null
          supplier_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          purchase_id?: string | null
          reference?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bin_no: string | null
          created_at: string
          due_balance: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          phone: string | null
          tenant_id: string
          updated_at: string
          vat_no: string | null
        }
        Insert: {
          address?: string | null
          bin_no?: string | null
          created_at?: string
          due_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          phone?: string | null
          tenant_id: string
          updated_at?: string
          vat_no?: string | null
        }
        Update: {
          address?: string | null
          bin_no?: string | null
          created_at?: string
          due_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          vat_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_staff: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_staff?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_staff?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          status?: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          batch_size: number
          created_at: string
          device_id: string | null
          duplicates: number
          duration_ms: number | null
          failed: number
          id: string
          notes: string | null
          succeeded: number
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          batch_size?: number
          created_at?: string
          device_id?: string | null
          duplicates?: number
          duration_ms?: number | null
          failed?: number
          id?: string
          notes?: string | null
          succeeded?: number
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          batch_size?: number
          created_at?: string
          device_id?: string | null
          duplicates?: number
          duration_ms?: number | null
          failed?: number
          id?: string
          notes?: string | null
          succeeded?: number
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          action: string
          attempts: number
          client_op_id: string
          client_ts: string | null
          created_at: string
          device_id: string | null
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          result: Json | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          attempts?: number
          client_op_id: string
          client_ts?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          result?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          attempts?: number
          client_op_id?: string
          client_ts?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          result?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          checked_at: string
          component: string
          detail: Json | null
          id: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          checked_at?: string
          component: string
          detail?: Json | null
          id?: string
          status: string
          tenant_id?: string | null
        }
        Update: {
          checked_at?: string
          component?: string
          detail?: Json | null
          id?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_health_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_classes: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          mode: string
          name: string
          rate: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mode?: string
          name: string
          rate?: number
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mode?: string
          name?: string
          rate?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          rate: number
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          rate?: number
          status?: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          rate?: number
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_access_violations: {
        Row: {
          action: string
          attempted_tenant_id: string | null
          created_at: string
          detail: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
          user_tenants: string[] | null
        }
        Insert: {
          action: string
          attempted_tenant_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
          user_tenants?: string[] | null
        }
        Update: {
          action?: string
          attempted_tenant_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
          user_tenants?: string[] | null
        }
        Relationships: []
      }
      tenant_branding: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          created_at: string
          favicon_url: string | null
          login_bg_url: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          favicon_url?: string | null
          login_bg_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          favicon_url?: string | null
          login_bg_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          ssl_status: string
          tenant_id: string
          verification_token: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          ssl_status?: string
          tenant_id: string
          verification_token?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          ssl_status?: string
          tenant_id?: string
          verification_token?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          default_branch_id: string | null
          id: string
          is_default: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_branch_id?: string | null
          id?: string
          is_default?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_branch_id?: string | null
          id?: string
          is_default?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_number_sequences: {
        Row: {
          created_at: string
          doc_type: string
          last_value: number | null
          prefix: string
          sequence_name: string
          start_value: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          last_value?: number | null
          prefix: string
          sequence_name: string
          start_value?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          last_value?: number | null
          prefix?: string
          sequence_name?: string
          start_value?: number
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          step_branches: boolean
          step_company: boolean
          step_opening_stock: boolean
          step_products: boolean
          step_suppliers: boolean
          step_warehouses: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          step_branches?: boolean
          step_company?: boolean
          step_opening_stock?: boolean
          step_products?: boolean
          step_suppliers?: boolean
          step_warehouses?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          step_branches?: boolean
          step_company?: boolean
          step_opening_stock?: boolean
          step_products?: boolean
          step_suppliers?: boolean
          step_warehouses?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          backup: Json
          branding: Json
          business_rules: Json
          clinical: Json
          created_at: string
          customer: Json
          data_management: Json
          integrations: Json
          inventory: Json
          locale: Json
          medicine: Json
          notifications: Json
          number_series: Json
          payments: Json
          pos: Json
          printers: Json
          reports: Json
          security: Json
          subscription: Json
          system: Json
          tax: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          backup?: Json
          branding?: Json
          business_rules?: Json
          clinical?: Json
          created_at?: string
          customer?: Json
          data_management?: Json
          integrations?: Json
          inventory?: Json
          locale?: Json
          medicine?: Json
          notifications?: Json
          number_series?: Json
          payments?: Json
          pos?: Json
          printers?: Json
          reports?: Json
          security?: Json
          subscription?: Json
          system?: Json
          tax?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          backup?: Json
          branding?: Json
          business_rules?: Json
          clinical?: Json
          created_at?: string
          customer?: Json
          data_management?: Json
          integrations?: Json
          inventory?: Json
          locale?: Json
          medicine?: Json
          notifications?: Json
          number_series?: Json
          payments?: Json
          pos?: Json
          printers?: Json
          reports?: Json
          security?: Json
          subscription?: Json
          system?: Json
          tax?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address_line: string | null
          allow_stock_override: boolean
          area: string | null
          auto_sync_global_catalog: boolean
          bin: string | null
          brand_color: string | null
          business_type: string | null
          country: string | null
          created_at: string
          custom_domain: string | null
          district: string | null
          division: string | null
          drug_license_no: string | null
          email: string | null
          id: string
          invoice_settings: Json
          language: string
          logo_url: string | null
          manager_name: string | null
          mobile: string | null
          name: string
          opening_date: string | null
          owner_name: string | null
          phone: string | null
          plan: Database["public"]["Enums"]["tenant_plan"]
          postal_code: string | null
          procurement_settings: Json
          profile_updated_at: string | null
          profile_updated_by: string | null
          receipt_logo_url: string | null
          slug: string
          status: string
          tin: string | null
          trade_license_no: string | null
          type: Database["public"]["Enums"]["tenant_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line?: string | null
          allow_stock_override?: boolean
          area?: string | null
          auto_sync_global_catalog?: boolean
          bin?: string | null
          brand_color?: string | null
          business_type?: string | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          district?: string | null
          division?: string | null
          drug_license_no?: string | null
          email?: string | null
          id?: string
          invoice_settings?: Json
          language?: string
          logo_url?: string | null
          manager_name?: string | null
          mobile?: string | null
          name: string
          opening_date?: string | null
          owner_name?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"]
          postal_code?: string | null
          procurement_settings?: Json
          profile_updated_at?: string | null
          profile_updated_by?: string | null
          receipt_logo_url?: string | null
          slug: string
          status?: string
          tin?: string | null
          trade_license_no?: string | null
          type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line?: string | null
          allow_stock_override?: boolean
          area?: string | null
          auto_sync_global_catalog?: boolean
          bin?: string | null
          brand_color?: string | null
          business_type?: string | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          district?: string | null
          division?: string | null
          drug_license_no?: string | null
          email?: string | null
          id?: string
          invoice_settings?: Json
          language?: string
          logo_url?: string | null
          manager_name?: string | null
          mobile?: string | null
          name?: string
          opening_date?: string | null
          owner_name?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"]
          postal_code?: string | null
          procurement_settings?: Json
          profile_updated_at?: string | null
          profile_updated_by?: string | null
          receipt_logo_url?: string | null
          slug?: string
          status?: string
          tin?: string | null
          trade_license_no?: string | null
          type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      therapeutic_classes: {
        Row: {
          aliases: string[]
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "therapeutic_classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          created_at: string
          factor: number
          from_unit_id: string
          id: string
          product_id: string
          tenant_id: string
          to_unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          factor: number
          from_unit_id: string
          id?: string
          product_id: string
          tenant_id: string
          to_unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          factor?: number
          from_unit_id?: string
          id?: string
          product_id?: string
          tenant_id?: string
          to_unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "unit_conversions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          aliases: string[]
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          name_bn: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          name_bn?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          name_bn?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_metering: {
        Row: {
          created_at: string
          id: string
          metric: string
          period_end: string
          period_start: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          period_end: string
          period_start: string
          tenant_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          period_end?: string
          period_start?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_metering_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          assigned_by: string | null
          branch_id: string | null
          created_at: string
          id: string
          role_id: string
          tenant_id: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          role_id: string
          tenant_id: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          role_id?: string
          tenant_id?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          branch_id: string | null
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_hq: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_hq?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_hq?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          event: string
          id: string
          latency_ms: number | null
          status_code: number | null
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          latency_ms?: number | null
          status_code?: number | null
          tenant_id: string
          webhook_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          latency_ms?: number | null
          status_code?: number | null
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          secret: string | null
          tenant_id: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          secret?: string | null
          tenant_id: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          secret?: string | null
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      global_catalog_duplicate_report: {
        Row: {
          cnt: number | null
          key: string | null
          kind: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          batch_count: number | null
          branch_id: string | null
          earliest_expiry: string | null
          product_id: string | null
          qty_on_hand: number | null
          qty_reserved: number | null
          stock_value: number | null
          tenant_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_clinical_dashboard: {
        Row: {
          alt_rows: number | null
          classified_medicines: number | null
          interactions: number | null
          major_interactions: number | null
          minor_interactions: number | null
          moderate_interactions: number | null
          refreshed_at: string | null
          singleton: number | null
          total_medicines: number | null
          with_alternatives: number | null
          with_contras: number | null
          with_dosage: number | null
          with_geriatric: number | null
          with_lactation: number | null
          with_pediatric: number | null
          with_pregnancy: number | null
        }
        Relationships: []
      }
      mv_inventory_summary: {
        Row: {
          nearest_expiry: string | null
          product_id: string | null
          qty_expiring_90d: number | null
          qty_on_hand: number | null
          stock_value: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_sales_daily: {
        Row: {
          day: string | null
          discount: number | null
          due: number | null
          invoice_count: number | null
          paid: number | null
          subtotal: number | null
          tenant_id: string | null
          total: number | null
          vat: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ai_accuracy: {
        Row: {
          approved: number | null
          avg_confidence: number | null
          avg_ms: number | null
          completed: number | null
          failed: number | null
          modified: number | null
          rejected: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_ocr_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_balance_sheet: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          tenant_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bi_customer_stats: {
        Row: {
          avg_order_value: number | null
          customer_id: string | null
          due_balance: number | null
          last_purchase_at: string | null
          name: string | null
          purchase_count: number | null
          tenant_id: string | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bi_inventory_aging: {
        Row: {
          aging_0_30: number | null
          aging_31_60: number | null
          aging_61_90: number | null
          aging_90_plus: number | null
          batch_count: number | null
          product_id: string | null
          product_name: string | null
          tenant_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bi_product_perf_30d: {
        Row: {
          last_sold_at: string | null
          margin_pct: number | null
          name: string | null
          product_id: string | null
          profit_30d: number | null
          qty_sold_30d: number | null
          revenue_30d: number | null
          sku: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bi_sales_daily: {
        Row: {
          avg_basket: number | null
          day: string | null
          discount: number | null
          gross_profit: number | null
          revenue: number | null
          subtotal: number | null
          tenant_id: string | null
          txn_count: number | null
          vat: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bi_supplier_stats: {
        Row: {
          due_exposure: number | null
          last_purchase_at: string | null
          name: string | null
          purchase_count: number | null
          supplier_id: string | null
          tenant_id: string | null
          total_purchased: number | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_branch_isolation_coverage: {
        Row: {
          has_branch_id: boolean | null
          has_tenant_id: boolean | null
          scope: string | null
          table_name: unknown
        }
        Relationships: []
      }
      v_branch_performance: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          collected: number | null
          gross_sales: number | null
          invoice_count: number | null
          net_sales: number | null
          outstanding: number | null
          parent_branch_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cash_flow: {
        Row: {
          account_code: string | null
          account_name: string | null
          inflow: number | null
          month: string | null
          net_change: number | null
          outflow: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cashflow_by_branch: {
        Row: {
          amount: number | null
          branch_id: string | null
          day: string | null
          direction: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_customer_due: {
        Row: {
          address: string | null
          allergies: string | null
          anniversary: string | null
          area: string | null
          blood_group: string | null
          chronic_diseases: string | null
          country: string | null
          created_at: string | null
          credit_limit: number | null
          customer_code: string | null
          customer_id: string | null
          date_of_birth: string | null
          district: string | null
          division: string | null
          doctor_reference: string | null
          due_balance: number | null
          email: string | null
          gender: string | null
          id: string | null
          is_active: boolean | null
          last_payment_at: string | null
          last_purchase_at: string | null
          name: string | null
          net_due: number | null
          nid_passport: string | null
          notes: string | null
          open_invoice_due: number | null
          opening_balance: number | null
          payment_terms_days: number | null
          phone: string | null
          postal_code: string | null
          sales_count: number | null
          stored_due_balance: number | null
          tenant_id: string | null
          total_collected: number | null
          total_paid_on_sales: number | null
          total_sales: number | null
          type: Database["public"]["Enums"]["customer_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_customer_due_reconciliation: {
        Row: {
          calculated_due: number | null
          customer_id: string | null
          name: string | null
          stored_due: number | null
          tenant_id: string | null
          variance: number | null
        }
        Insert: {
          calculated_due?: never
          customer_id?: string | null
          name?: string | null
          stored_due?: number | null
          tenant_id?: string | null
          variance?: never
        }
        Update: {
          calculated_due?: never
          customer_id?: string | null
          name?: string | null
          stored_due?: number | null
          tenant_id?: string | null
          variance?: never
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_customer_ledger: {
        Row: {
          credit: number | null
          debit: number | null
          entry_date: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"] | null
          notes: string | null
          party_id: string | null
          party_name: string | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          running_balance: number | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_due_summary_by_branch: {
        Row: {
          branch_id: string | null
          party_type: string | null
          tenant_id: string | null
          total_due: number | null
        }
        Relationships: []
      }
      v_equity_changes: {
        Row: {
          account_code: string | null
          account_name: string | null
          month: string | null
          net_change: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_expiry_alert: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          bucket: string | null
          days_to_expiry: number | null
          expiry_date: string | null
          product_id: string | null
          product_name: string | null
          qty_on_hand: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_expiry_alert_by_branch: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          branch_id: string | null
          days_to_expiry: number | null
          expiry_date: string | null
          product_id: string | null
          qty_on_hand: number | null
          tenant_id: string | null
        }
        Insert: {
          batch_id?: string | null
          batch_no?: string | null
          branch_id?: string | null
          days_to_expiry?: never
          expiry_date?: string | null
          product_id?: string | null
          qty_on_hand?: number | null
          tenant_id?: string | null
        }
        Update: {
          batch_id?: string | null
          batch_no?: string | null
          branch_id?: string | null
          days_to_expiry?: never
          expiry_date?: string | null
          product_id?: string | null
          qty_on_hand?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_general_ledger: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          entry_no: string | null
          is_reversal: boolean | null
          journal_id: string | null
          notes: string | null
          ref_no: string | null
          ref_table: string | null
          running_balance: number | null
          tenant_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_by_branch: {
        Row: {
          branch_id: string | null
          product_id: string | null
          qty_on_hand: number | null
          reorder_level: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_summary: {
        Row: {
          nearest_expiry: string | null
          product_id: string | null
          qty_expiring_90d: number | null
          qty_on_hand: number | null
          stock_value: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_low_stock: {
        Row: {
          product_id: string | null
          product_name: string | null
          qty_available: number | null
          reorder_level: number | null
          sku: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_low_stock_by_branch: {
        Row: {
          branch_id: string | null
          product_id: string | null
          qty_on_hand: number | null
          reorder_level: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_musak_summary: {
        Row: {
          input_vat: number | null
          output_vat: number | null
          period: string | null
          purchase_gross: number | null
          purchase_net: number | null
          sales_gross: number | null
          sales_net: number | null
          tenant_id: string | null
          vat_payable: number | null
        }
        Relationships: []
      }
      v_outstanding_dues: {
        Row: {
          balance: number | null
          party_id: string | null
          party_name: string | null
          party_type: Database["public"]["Enums"]["party_type"] | null
          phone: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_profit_loss_by_branch: {
        Row: {
          branch_id: string | null
          cost_of_goods: number | null
          month: string | null
          net_profit: number | null
          operating_expenses: number | null
          other_income: number | null
          revenue: number | null
          tenant_id: string | null
        }
        Relationships: []
      }
      v_purchase_summary_by_branch: {
        Row: {
          branch_id: string | null
          day: string | null
          due_total: number | null
          gross_purchases: number | null
          gross_returns: number | null
          paid_total: number | null
          purchase_count: number | null
          return_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_purchase_vat_register: {
        Row: {
          batch_no: string | null
          grn_id: string | null
          grn_no: string | null
          gross: number | null
          gross_line: number | null
          net: number | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          receipt_date: string | null
          supplier_bin_no: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_vat_no: string | null
          tenant_id: string | null
          unit_cost: number | null
          vat: number | null
          vat_mode: string | null
          vat_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_bi_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_daily: {
        Row: {
          day: string | null
          discount: number | null
          due: number | null
          invoice_count: number | null
          paid: number | null
          subtotal: number | null
          tenant_id: string | null
          total: number | null
          vat: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_daily_by_branch: {
        Row: {
          branch_id: string | null
          day: string | null
          discount_total: number | null
          due_total: number | null
          gross_returns: number | null
          gross_sales: number | null
          paid_total: number | null
          returns_count: number | null
          sales_count: number | null
          tenant_id: string | null
          vat_collected: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_branch_performance"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_vat_register: {
        Row: {
          customer_bin_no: string | null
          customer_id: string | null
          customer_name: string | null
          customer_vat_no: string | null
          gross: number | null
          gross_line: number | null
          invoice_date: string | null
          invoice_no: string | null
          net: number | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          sale_id: string | null
          tenant_id: string | null
          unit_price: number | null
          vat: number | null
          vat_mode: string | null
          vat_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_bi_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_due_reconciliation"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_on_hand: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          expiry_date: string | null
          product_id: string | null
          product_name: string | null
          purchase_price: number | null
          qty_on_hand: number | null
          sku: string | null
          stock_value: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bi_product_perf_30d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_valuation"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_valuation: {
        Row: {
          product_id: string | null
          product_name: string | null
          qty_on_hand: number | null
          sku: string | null
          stock_value: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_ap_recon: {
        Row: {
          ap_account_due: number | null
          supplier_ledger_due: number | null
          tenant_id: string | null
          variance: number | null
        }
        Relationships: []
      }
      v_supplier_ledger: {
        Row: {
          credit: number | null
          debit: number | null
          entry_date: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"] | null
          notes: string | null
          party_id: string | null
          party_name: string | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          running_balance: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trial_balance: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trial_balance_by_warehouse: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _classify_class: { Args: { _gname: string }; Returns: string[] }
      _cycle_days: { Args: { p_cycle: string }; Returns: number }
      _cycle_months: { Args: { _cycle: string }; Returns: number }
      _seed_contras: {
        Args: {
          _conds: string[]
          _kw: string
          _sev: Database["public"]["Enums"]["drug_interaction_severity"]
        }
        Returns: undefined
      }
      _seed_interactions: {
        Args: {
          _desc: string
          _eff: string
          _ga: string
          _gb: string
          _rec: string
          _sev: Database["public"]["Enums"]["drug_interaction_severity"]
        }
        Returns: undefined
      }
      activate_subscription_from_payment: {
        Args: { _payment_id: string }
        Returns: Json
      }
      admin_adoption_analytics: { Args: never; Returns: Json }
      admin_assign_plan: {
        Args: {
          p_cycle: string
          p_plan: string
          p_tenant: string
          p_trial_days: number
        }
        Returns: string
      }
      admin_auto_sync_overview: { Args: never; Returns: Json }
      admin_cancel_scheduled_change: {
        Args: { p_subscription: string }
        Returns: undefined
      }
      admin_change_plan: {
        Args: {
          p_cycle: string
          p_mode?: string
          p_new_plan: string
          p_subscription: string
          p_waive_fees?: boolean
        }
        Returns: Json
      }
      admin_convert_trial: {
        Args: { p_subscription: string }
        Returns: undefined
      }
      admin_create_manual_invoice: {
        Args: {
          p_amount: number
          p_discount?: number
          p_notes?: string
          p_subscription_id: string
          p_vat_percent?: number
        }
        Returns: string
      }
      admin_expiry_widgets: { Args: never; Returns: Json }
      admin_list_cart_batches: {
        Args: {
          _product_ids: string[]
          _tenant_id: string
          _warehouse_id: string
        }
        Returns: {
          batch_no: string
          branch_id: string
          expiry_date: string
          id: string
          product_id: string
          qty_on_hand: number
          warehouse_id: string
        }[]
      }
      admin_list_tenants: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          type: Database["public"]["Enums"]["tenant_type"]
        }[]
      }
      admin_list_warehouses: {
        Args: { _tenant_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          id: string
          is_default: boolean
          name: string
          status: string
        }[]
      }
      admin_plan_analytics: {
        Args: never
        Returns: {
          active_count: number
          expired_count: number
          mrr: number
          plan_code: string
          plan_id: string
          plan_name: string
          revenue_last_30d: number
          suspended_count: number
          trial_count: number
        }[]
      }
      admin_plan_analytics_impl: {
        Args: never
        Returns: {
          active_count: number
          expired_count: number
          mrr: number
          plan_code: string
          plan_id: string
          plan_name: string
          revenue_last_30d: number
          suspended_count: number
          trial_count: number
        }[]
      }
      admin_register_pharmacy_store: {
        Args: {
          _address?: string
          _district?: string
          _email: string
          _initial_plan?: string
          _initial_status?: string
          _mobile: string
          _owner_name: string
          _owner_user_id: string
          _pharmacy_name: string
          _trade_license?: string
        }
        Returns: string
      }
      admin_renew_subscription: {
        Args: { p_subscription: string }
        Returns: undefined
      }
      admin_set_subscription_status: {
        Args: { p_status: string; p_subscription: string }
        Returns: undefined
      }
      admin_set_tenant_auto_sync: {
        Args: { _enabled: boolean; _tenant_id: string }
        Returns: boolean
      }
      admin_switch_tenant: {
        Args: { _tenant_id: string }
        Returns: {
          id: string
          name: string
          slug: string
          status: string
          type: Database["public"]["Enums"]["tenant_type"]
        }[]
      }
      adoption_suggestions: {
        Args: { _limit?: number; _tenant: string }
        Returns: {
          adoption_count: number
          brand_name: string
          dosage_form: string
          generic_name: string
          global_medicine_id: string
          manufacturer_name: string
          strength: string
        }[]
      }
      approve_global_contribution: { Args: { _id: string }; Returns: string }
      approve_match_review: { Args: { _id: string }; Returns: string }
      approve_purchase_return: {
        Args: { _return_id: string; _tenant_id: string }
        Returns: Json
      }
      approve_purchase_return_impl: {
        Args: { _return_id: string; _tenant_id: string }
        Returns: Json
      }
      approve_subscription_payment: {
        Args: { _notes?: string; _payment_id: string }
        Returns: {
          auto_renew: boolean
          billing_cycle: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          expires_at: string | null
          external_ref: string | null
          grace_period_ends_at: string | null
          grace_until: string | null
          id: string
          last_payment_at: string | null
          last_payment_failed_at: string | null
          notes: string | null
          plan_id: string
          scheduled_change_at: string | null
          scheduled_cycle: string | null
          scheduled_plan_id: string | null
          starts_at: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_admin_notifications: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      archive_notifications: { Args: { _ids: string[] }; Returns: number }
      assert_app_admin: { Args: { _uid: string }; Returns: boolean }
      assert_invoice_payable: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      assert_self_or_admin: {
        Args: { _uid: string; _user: string }
        Returns: boolean
      }
      assert_subscription_active: {
        Args: { _tenant_id: string }
        Returns: undefined
      }
      assert_tenant_access: {
        Args: { _tenant: string; _uid: string }
        Returns: boolean
      }
      attempt_auto_renewal: { Args: never; Returns: Json }
      audit_branch_null_readiness: {
        Args: never
        Returns: {
          branch_id_null_rows: number
          ready_for_not_null: boolean
          table_name: string
          total_rows: number
        }[]
      }
      audit_log_event:
        | {
            Args: {
              _action: string
              _branch_id: string
              _entity_id: string
              _entity_type: string
              _metadata?: Json
              _tenant_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _action: string
              _after?: Json
              _before?: Json
              _branch_id?: string
              _browser?: string
              _device?: string
              _entity_id?: string
              _entity_table?: string
              _ip?: unknown
              _session_id?: string
              _tenant_id: string
              _user_agent?: string
              _user_role?: string
            }
            Returns: {
              action: string
              after_data: Json | null
              before_data: Json | null
              branch_id: string | null
              browser: string | null
              created_at: string
              device: string | null
              entity_id: string | null
              entity_table: string | null
              id: string
              ip_address: unknown
              session_id: string | null
              tenant_id: string | null
              user_agent: string | null
              user_id: string | null
              user_role: string | null
            }
            SetofOptions: {
              from: "*"
              to: "audit_log"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      audit_purge: { Args: { _keep_days: number }; Returns: number }
      backfill_global_catalog: { Args: never; Returns: Json }
      backfill_historical_journals: {
        Args: { _dry_run?: boolean; _tenant_id: string }
        Returns: Json
      }
      backfill_journal_warehouse: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      backfill_supplier_journals: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      backfill_supplier_journals_impl: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      backfill_supplier_ledger: { Args: { _tenant_id: string }; Returns: Json }
      backup_table_catalog: {
        Args: never
        Returns: {
          columns: Json
          has_id: boolean
          has_tenant_id: boolean
          table_name: string
        }[]
      }
      barcode_lookup_global: {
        Args: { _barcode: string }
        Returns: {
          brand_name: string
          dosage_form: string
          generic_name: string
          global_medicine_id: string
          manufacturer_name: string
          strength: string
        }[]
      }
      batch_adjust: {
        Args: {
          _batch_id: string
          _delta: number
          _notes?: string
          _reason: string
          _tenant_id: string
        }
        Returns: string
      }
      batch_merge: {
        Args: {
          _dst_batch_id: string
          _src_batch_id: string
          _tenant_id: string
        }
        Returns: string
      }
      batch_recall: {
        Args: {
          _batch_id: string
          _notes?: string
          _reason: string
          _source: string
          _tenant_id: string
        }
        Returns: string
      }
      batch_split: {
        Args: {
          _batch_id: string
          _new_batch_no?: string
          _qty: number
          _tenant_id: string
        }
        Returns: string
      }
      batch_transfer: {
        Args: {
          _batch_id: string
          _from_branch: string
          _notes?: string
          _qty: number
          _tenant_id: string
          _to_branch: string
        }
        Returns: string
      }
      batch_transfer_approve: {
        Args: {
          _approve: boolean
          _reject_reason?: string
          _tenant_id: string
          _transfer_id: string
        }
        Returns: string
      }
      batch_transfer_request: {
        Args: {
          _batch_id: string
          _from_branch: string
          _notes?: string
          _qty: number
          _tenant_id: string
          _to_branch: string
        }
        Returns: string
      }
      branch_dashboard_metrics: {
        Args: { _branch: string; _tenant: string }
        Returns: Json
      }
      browse_global_catalog: {
        Args: {
          _dosage_form?: string
          _generic_id?: string
          _limit?: number
          _manufacturer_id?: string
          _offset?: number
          _otc_only?: boolean
          _prescription_only?: boolean
          _q?: string
          _tenant: string
          _therapeutic_class_id?: string
        }
        Returns: {
          already_in_catalog: boolean
          brand_name: string
          dosage_form: string
          generic_name: string
          id: string
          manufacturer_name: string
          otc_allowed: boolean
          prescription_required: boolean
          strength: string
          total_count: number
        }[]
      }
      bulk_adopt_global: {
        Args: { _ids: string[]; _tenant: string }
        Returns: {
          created_count: number
          created_product_ids: string[]
          skipped_count: number
        }[]
      }
      bulk_approve_match_reviews: {
        Args: { _min_confidence?: number }
        Returns: number
      }
      calc_dose_qty: { Args: { _days: number; _dose: string }; Returns: number }
      can_access_warehouse: {
        Args: { _tenant_id: string; _user_id: string; _warehouse_id: string }
        Returns: boolean
      }
      can_create_resource: {
        Args: { _resource: string; _tenant_id: string }
        Returns: {
          allowed: boolean
          max_allowed: number
          reason: string
          used: number
        }[]
      }
      cancel_sale_invoice: {
        Args: {
          _reason: string
          _reverse_stock?: boolean
          _sale_id: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_sale_journals: {
        Args: { _reason: string; _sale_id: string; _tenant_id: string }
        Returns: undefined
      }
      cash_register_summary: { Args: { _register_id: string }; Returns: Json }
      catalog_backfill_metrics: { Args: never; Returns: Json }
      catalog_sync_chunk: {
        Args: { _after?: string; _limit?: number }
        Returns: Json
      }
      check_plan_limit: {
        Args: { _resource: string; _tenant: string }
        Returns: boolean
      }
      check_plan_usage: {
        Args: { _tenant_id: string }
        Returns: {
          plan: Database["public"]["Enums"]["tenant_plan"]
          products_limit: number
          products_over: boolean
          products_used: number
          users_limit: number
          users_over: boolean
          users_used: number
        }[]
      }
      close_cash_register: {
        Args: { _actual_cash: number; _notes?: string; _register_id: string }
        Returns: {
          actual_closing_amount: number | null
          branch_id: string | null
          closed_at: string | null
          closing_notes: string | null
          created_at: string
          expected_closing_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          register_name: string
          status: Database["public"]["Enums"]["cash_register_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_registers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      collect_customer_due: {
        Args: {
          _amount: number
          _client_op_id?: string
          _customer_id: string
          _method?: string
          _notes?: string
          _payment_date?: string
          _reference?: string
          _register_id?: string
          _sale_id?: string
          _tenant_id: string
        }
        Returns: {
          amount: number
          branch_id: string
          client_op_id: string | null
          collected_by: string | null
          created_at: string
          customer_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          reference: string | null
          sale_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_opening_stock: {
        Args: { _items: Json; _tenant_id: string }
        Returns: Json
      }
      compute_vat: {
        Args: { _amount: number; _mode?: string; _rate: number }
        Returns: {
          gross: number
          net: number
          vat: number
        }[]
      }
      contribute_global_medicine: {
        Args: { _payload: Json; _product: string; _tenant: string }
        Returns: string
      }
      corporate_dashboard_metrics: { Args: { _tenant: string }; Returns: Json }
      count_products_with_stock: {
        Args: { _tenant_id: string }
        Returns: number
      }
      create_subscription_invoice: {
        Args: {
          p_amount?: number
          p_discount?: number
          p_kind?: string
          p_notes?: string
          p_payment_id?: string
          p_status?: string
          p_subscription_id: string
          p_vat_percent?: number
        }
        Returns: string
      }
      current_tenant_subscription_status: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      current_tenant_subscription_status_impl: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      customer_due_summary: { Args: { p_customer_id: string }; Returns: number }
      delete_notifications: { Args: { _ids: string[] }; Returns: number }
      downgrade_plan: {
        Args: { _plan: string; _tenant: string }
        Returns: undefined
      }
      ean13_checksum: { Args: { _digits12: string }; Returns: string }
      edit_sale_invoice: {
        Args: {
          _cashier_id: string
          _client_op_id?: string
          _customer_id: string
          _discount?: number
          _items?: Json
          _notes?: string
          _original_sale_id: string
          _payments?: Json
          _register_id?: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enforce_tenant_limit: {
        Args: { _resource: string; _tenant: string }
        Returns: undefined
      }
      enrich_import_normalized_masters: {
        Args: { _normalized: Json; _tenant: string }
        Returns: Json
      }
      expire_old_holds: { Args: never; Returns: number }
      feature_flag_enabled: {
        Args: { _default?: boolean; _features: Json; _key: string }
        Returns: boolean
      }
      find_global_match: {
        Args: { _product_id: string }
        Returns: {
          confidence: number
          global_medicine_id: string
          match_level: number
        }[]
      }
      find_substitutes: {
        Args: { _product_id: string; _tenant_id: string }
        Returns: {
          id: string
          name: string
          qty_on_hand: number
          retail_price: number
          sku: string
        }[]
      }
      generate_journal_no: { Args: { _tenant_id: string }; Returns: string }
      generate_next_number: {
        Args: { _doc_type: string; _tenant_id: string }
        Returns: string
      }
      get_active_subscription: {
        Args: { _tenant_id: string }
        Returns: {
          auto_renew: boolean
          billing_cycle: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          expires_at: string | null
          external_ref: string | null
          grace_period_ends_at: string | null
          grace_until: string | null
          id: string
          last_payment_at: string | null
          last_payment_failed_at: string | null
          notes: string | null
          plan_id: string
          scheduled_change_at: string | null
          scheduled_cycle: string | null
          scheduled_plan_id: string | null
          starts_at: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_active_subscription_impl: {
        Args: { _tenant_id: string }
        Returns: {
          auto_renew: boolean
          billing_cycle: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          expires_at: string | null
          external_ref: string | null
          grace_period_ends_at: string | null
          grace_until: string | null
          id: string
          last_payment_at: string | null
          last_payment_failed_at: string | null
          notes: string | null
          plan_id: string
          scheduled_change_at: string | null
          scheduled_cycle: string | null
          scheduled_plan_id: string | null
          starts_at: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_alternative_suggestions: {
        Args: { _medicine_id: string }
        Returns: {
          alternative_id: string
          brand_name: string
          confidence: number
          dosage_form: string
          generic_name: string
          manufacturer_name: string
          priority: number
          reason: string
          strength: string
        }[]
      }
      get_basket_interactions: {
        Args: { _medicine_ids: string[] }
        Returns: {
          a_name: string
          b_name: string
          clinical_effect: string
          description: string
          medicine_a: string
          medicine_b: string
          recommendation: string
          severity: Database["public"]["Enums"]["drug_interaction_severity"]
        }[]
      }
      get_clinical_dashboard: { Args: never; Returns: Json }
      get_inventory_overview: { Args: { _tenant_id: string }; Returns: Json }
      get_inventory_overview_impl: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      get_landing_cms: {
        Args: never
        Returns: {
          content_bn: Json
          content_en: Json
          updated_at: string
        }[]
      }
      get_my_tenant_status: {
        Args: never
        Returns: {
          status: string
          tenant_id: string
        }[]
      }
      get_number_series_counter: {
        Args: { _doc_type: string; _tenant_id: string }
        Returns: number
      }
      get_opening_stock_products: {
        Args: {
          _filter?: string
          _page?: number
          _page_size?: number
          _search?: string
          _tenant_id: string
        }
        Returns: Json
      }
      get_opening_stock_products_impl: {
        Args: {
          _filter?: string
          _page?: number
          _page_size?: number
          _search?: string
          _tenant_id: string
        }
        Returns: Json
      }
      get_payment_gateway_secrets: {
        Args: { _gateway_id: string }
        Returns: {
          api_key: string
          secret_key: string
        }[]
      }
      get_plan_pricing: {
        Args: { p_cycle: string; p_plan: string }
        Returns: {
          discount_percent: number
          duration_days: number
          net_price: number
          price_bdt: number
        }[]
      }
      get_product_batch_for_barcode: {
        Args: { _product_id: string; _tenant_id: string }
        Returns: {
          batch_no: string
          expiry_date: string
          qty_on_hand: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_product_stats: {
        Args: { p_tenant_id: string }
        Returns: {
          in_stock: number
          low_stock: number
          negative: number
          out_of_stock: number
          total: number
          total_value: number
        }[]
      }
      get_store_dashboard_v2: { Args: { _tenant_id: string }; Returns: Json }
      get_store_setup_status: { Args: { _tenant_id: string }; Returns: Json }
      get_system_health: { Args: { _tenant_id: string }; Returns: Json }
      get_tenant_product_capacity: {
        Args: { p_tenant_id: string }
        Returns: {
          max_products: number
          plan_code: string
          used: number
        }[]
      }
      get_tenant_product_capacity_impl: {
        Args: { p_tenant_id: string }
        Returns: {
          max_products: number
          plan_code: string
          used: number
        }[]
      }
      grn_approve: {
        Args: { _grn_id: string; _tenant_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          client_op_id: string | null
          created_at: string
          grn_no: string
          id: string
          notes: string | null
          po_id: string
          received_at: string
          received_by: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          total_value: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "goods_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grn_receive: {
        Args: {
          _allow_over?: boolean
          _grn_no: string
          _lines?: Json
          _notes?: string
          _po_id: string
          _tenant_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          client_op_id: string | null
          created_at: string
          grn_no: string
          id: string
          notes: string | null
          po_id: string
          received_at: string
          received_by: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          total_value: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "goods_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_branch_access: {
        Args: { _branch: string; _user: string }
        Returns: boolean
      }
      has_feature: {
        Args: { _feature_code: string; _tenant_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_feature: {
        Args: { _feature: string; _tenant: string }
        Returns: boolean
      }
      increment_blog_view: { Args: { _slug: string }; Returns: undefined }
      increment_supplier_due_balance: {
        Args: { _amount: number; _supplier_id: string }
        Returns: number
      }
      inventory_adjust: {
        Args: {
          _batch_id: string
          _movement_type: Database["public"]["Enums"]["movement_type"]
          _product_id: string
          _qty_change: number
          _reason?: string
          _reference_no?: string
          _tenant_id: string
        }
        Returns: {
          batch_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          product_id: string
          qty_after: number | null
          qty_change: number
          reference_id: string | null
          reference_no: string | null
          reference_table: string | null
          tenant_id: string
          user_id: string | null
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      inventory_expire_batches: {
        Args: { _tenant_id: string }
        Returns: number
      }
      inventory_expire_batches_all: { Args: never; Returns: number }
      inventory_physical_count: {
        Args: {
          _batch_id: string
          _counted_qty: number
          _product_id: string
          _reason?: string
          _tenant_id: string
        }
        Returns: {
          batch_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          product_id: string
          qty_after: number | null
          qty_change: number
          reference_id: string | null
          reference_no: string | null
          reference_table: string | null
          tenant_id: string
          user_id: string | null
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_app_admin: { Args: { _user_id: string }; Returns: boolean }
      is_branch_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_clinical_or_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_corporate_role: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      is_corporate_writer: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      is_manager_or_owner: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_subscription_active: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_manager_or_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_owner_or_admin: { Args: { _tenant: string }; Returns: boolean }
      link_products_to_global: { Args: never; Returns: Json }
      list_actionable_batches: {
        Args: { _limit?: number; _search?: string; _tenant_id: string }
        Returns: Json
      }
      list_batch_control_batches: {
        Args: {
          _page?: number
          _page_size?: number
          _search?: string
          _sort?: string
          _tenant_id: string
        }
        Returns: Json
      }
      list_cart_batches: {
        Args: {
          _product_ids: string[]
          _tenant_id: string
          _warehouse_id: string
        }
        Returns: {
          batch_no: string
          branch_id: string
          expiry_date: string
          id: string
          product_id: string
          qty_on_hand: number
          warehouse_id: string
        }[]
      }
      list_inventory_in_stock_products: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_tenant_id: string
        }
        Returns: {
          current_page: number
          rows: Json
          total_count: number
          total_pages: number
        }[]
      }
      list_products_for_management:
        | {
            Args: {
              p_barcode?: string
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_tenant_id: string
            }
            Returns: {
              barcode: string
              branch_id: string
              country_of_origin: string
              generic_name: string
              id: string
              is_active: boolean
              manufacturer_name: string
              medicine_type: string
              name: string
              purchase_price: number
              qty_per_box: number
              reorder_level: number
              retail_price: number
              sku: string
              status: string
              stock: number
              strength: string
              total_count: number
              volume: string
            }[]
          }
        | {
            Args: {
              p_barcode?: string
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_status_filter?: string
              p_tenant_id: string
              p_with_count?: boolean
            }
            Returns: {
              barcode: string
              branch_id: string
              country_of_origin: string
              generic_name: string
              id: string
              is_active: boolean
              manufacturer_name: string
              medicine_type: string
              name: string
              purchase_price: number
              qty_per_box: number
              reorder_level: number
              retail_price: number
              sku: string
              status: string
              stock: number
              strength: string
              total_count: number
              volume: string
            }[]
          }
      list_public_trusted_tenants: {
        Args: { _limit?: number }
        Returns: {
          id: string
          logo_url: string
          name: string
        }[]
      }
      list_purchase_requisitions: {
        Args: {
          _date_from?: string
          _date_to?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _supplier_id?: string
          _tenant_id: string
          _warehouse_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          created_by_email: string
          estimated_amount: number
          expected_date: string
          id: string
          pr_number: string
          remarks: string
          requisition_date: string
          status: string
          supplier_id: string
          supplier_name: string
          total_count: number
          total_items: number
          total_qty: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      list_purchase_requisitions_impl: {
        Args: {
          _date_from?: string
          _date_to?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _supplier_id?: string
          _tenant_id: string
          _warehouse_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          created_by_email: string
          estimated_amount: number
          expected_date: string
          id: string
          pr_number: string
          remarks: string
          requisition_date: string
          status: string
          supplier_id: string
          supplier_name: string
          total_count: number
          total_items: number
          total_qty: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      log_tenant_violation: {
        Args: {
          _action: string
          _attempted_tenant_id: string
          _detail?: string
          _ip?: unknown
          _ua?: string
        }
        Returns: {
          action: string
          attempted_tenant_id: string | null
          created_at: string
          detail: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
          user_tenants: string[] | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_access_violations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_admin_notifications_read: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      mark_all_admin_notifications_read: { Args: never; Returns: undefined }
      mark_all_notifications_read: {
        Args: { _tenant_id: string }
        Returns: undefined
      }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: undefined }
      mark_subscription_invoices_overdue: { Args: never; Returns: number }
      master_canonical_code: { Args: { _name: string }; Returns: string }
      master_merge: {
        Args: { _kind: string; _source_ids: string[]; _target_id: string }
        Returns: Json
      }
      master_merge_server: {
        Args: {
          _actor: string
          _kind: string
          _source_ids: string[]
          _target_id: string
        }
        Returns: Json
      }
      master_stats: { Args: { _kind: string; _tenant: string }; Returns: Json }
      master_stats_server: {
        Args: { _kind: string; _tenant: string }
        Returns: Json
      }
      match_global_medicine: {
        Args: {
          _brand: string
          _form: string
          _generic: string
          _mfr: string
          _strength: string
        }
        Returns: string
      }
      merge_product_duplicates: {
        Args: { _dup_ids: string[]; _keep_id: string; _tenant_id: string }
        Returns: Json
      }
      migrate_global_barcodes: { Args: never; Returns: Json }
      next_auto_barcode: { Args: { _tenant_id: string }; Returns: string }
      next_doc_no: {
        Args: { _doc_type: string; _tenant_id: string }
        Returns: string
      }
      next_internal_barcode: { Args: { _tenant: string }; Returns: string }
      next_invoice_no: { Args: { _tenant_id: string }; Returns: string }
      next_subscription_invoice_no: { Args: never; Returns: string }
      norm_text: { Args: { t: string }; Returns: string }
      notification_should_deliver: {
        Args: {
          _alert_type: string
          _channel?: string
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      notify_admin: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _idempotency_key?: string
          _link?: string
          _message?: string
          _metadata?: Json
          _severity: string
          _title: string
          _type: string
        }
        Returns: string
      }
      notify_tenant: {
        Args: {
          _body?: string
          _data?: Json
          _link?: string
          _tenant_id: string
          _title: string
          _type: string
        }
        Returns: number
      }
      notify_tenant_v2: {
        Args: {
          _body?: string
          _data?: Json
          _entity_id?: string
          _entity_type?: string
          _kind: string
          _link?: string
          _severity: string
          _tenant_id: string
          _title: string
        }
        Returns: number
      }
      open_cash_register: {
        Args: {
          _branch_id: string
          _notes?: string
          _opening_amount: number
          _register_name: string
          _tenant_id: string
        }
        Returns: {
          actual_closing_amount: number | null
          branch_id: string | null
          closed_at: string | null
          closing_notes: string | null
          created_at: string
          expected_closing_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          register_name: string
          status: Database["public"]["Enums"]["cash_register_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_registers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payment_method_account_code: {
        Args: { _method: string }
        Returns: string
      }
      plan_limits: {
        Args: { _plan: Database["public"]["Enums"]["tenant_plan"] }
        Returns: {
          max_products: number
          max_users: number
        }[]
      }
      po_approve: {
        Args: { _po_id: string; _tenant_id: string }
        Returns: undefined
      }
      po_reject: {
        Args: { _po_id: string; _reason?: string; _tenant_id: string }
        Returns: undefined
      }
      po_submit: {
        Args: { _po_id: string; _tenant_id: string }
        Returns: undefined
      }
      pos_checkout: {
        Args: {
          _cashier_id: string
          _client_op_id?: string
          _customer_id: string
          _discount?: number
          _invoice_no: string
          _items?: Json
          _notes?: string
          _payments?: Json
          _register_id?: string
          _tenant_id: string
          _warehouse_id?: string
        }
        Returns: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pos_return: {
        Args: {
          _client_op_id?: string
          _items?: Json
          _notes?: string
          _reason?: string
          _refund_amount?: number
          _refund_method?: string
          _register_id?: string
          _sale_id: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          client_op_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          notes: string | null
          reason: string | null
          refund_method: Database["public"]["Enums"]["payment_method"]
          refunded_amount: number
          return_date: string
          return_no: string
          sale_id: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
        }
        SetofOptions: {
          from: "*"
          to: "sales_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_collection_journal: {
        Args: { _payment_id: string; _tenant_id: string }
        Returns: string
      }
      post_grn_journal: {
        Args: { _grn_id: string; _tenant_id: string }
        Returns: string
      }
      post_inventory_adjustment_journal: {
        Args: {
          _branch_id: string
          _memo: string
          _movement_id: string
          _movement_type: string
          _qty_change: number
          _ref_id: string
          _ref_no: string
          _ref_table: string
          _tenant_id: string
          _value: number
        }
        Returns: string
      }
      post_journal: {
        Args: {
          _entry_date: string
          _entry_no: string
          _lines: Json
          _notes: string
          _ref_id: string
          _ref_no: string
          _ref_table: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          created_at: string
          entry_date: string
          entry_no: string
          id: string
          is_reversal: boolean
          journal_no: string | null
          notes: string | null
          posted: boolean
          posted_by: string | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          reversal_reason: string | null
          reversed_journal_id: string | null
          tenant_id: string
          total_credit: number
          total_debit: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "journal_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_journal_with_branch: {
        Args: {
          _branch_id: string
          _entry_date: string
          _entry_no: string
          _lines: Json
          _notes: string
          _ref_id: string
          _ref_no: string
          _ref_table: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          created_at: string
          entry_date: string
          entry_no: string
          id: string
          is_reversal: boolean
          journal_no: string | null
          notes: string | null
          posted: boolean
          posted_by: string | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          reversal_reason: string | null
          reversed_journal_id: string | null
          tenant_id: string
          total_credit: number
          total_debit: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "journal_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_ledger_entry: {
        Args: {
          _credit?: number
          _debit?: number
          _entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          _notes?: string
          _party_id: string
          _party_type: Database["public"]["Enums"]["party_type"]
          _ref_id?: string
          _ref_no?: string
          _ref_table?: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          entry_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          notes: string | null
          party_id: string
          party_type: Database["public"]["Enums"]["party_type"]
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "party_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_opening_stock_journal: {
        Args: { _batch_id: string; _tenant_id: string }
        Returns: string
      }
      post_po_journal: {
        Args: { _po_id: string; _tenant_id: string }
        Returns: string
      }
      post_purchase_return_journal: {
        Args: { _return_id: string; _tenant_id: string }
        Returns: string
      }
      post_return_journal: {
        Args: { _return_id: string; _tenant_id: string }
        Returns: string
      }
      post_sale_journal: {
        Args: { _sale_id: string; _tenant_id: string }
        Returns: string
      }
      post_supplier_ledger_idempotent: {
        Args: {
          _credit: number
          _debit: number
          _entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          _notes: string
          _ref_id: string
          _ref_no: string
          _ref_table: string
          _supplier_id: string
          _tenant_id: string
        }
        Returns: string
      }
      post_supplier_opening_journal: {
        Args: { _supplier_id: string; _tenant_id: string }
        Returns: string
      }
      post_supplier_payment_journal: {
        Args: { _payment_id: string; _tenant_id: string }
        Returns: string
      }
      post_supplier_return_adhoc_journal: {
        Args: {
          _date?: string
          _ref_no: string
          _tenant_id: string
          _value: number
        }
        Returns: string
      }
      precision_test_due: {
        Args: { p_iterations: number; p_start: number; p_step: number }
        Returns: {
          balance: number
          iteration: number
        }[]
      }
      process_catalog_provision_job: {
        Args: { _branch_id: string; _job_name: string; _tenant_id: string }
        Returns: undefined
      }
      process_global_import_chunk: {
        Args: { _batch?: number; _job: string }
        Returns: Json
      }
      process_invoice_dunning: { Args: never; Returns: Json }
      process_product_import_chunk_v2: {
        Args: { _batch?: number; _job: string }
        Returns: Json
      }
      process_product_import_chunk_v2_impl: {
        Args: { _batch?: number; _job: string }
        Returns: Json
      }
      process_subscription_expiry: { Args: never; Returns: Json }
      process_subscription_grace_period: { Args: never; Returns: Json }
      process_subscription_reactivation: { Args: never; Returns: Json }
      provision_catalog_for_tenant: {
        Args: { _branch_id: string; _limit?: number; _tenant_id: string }
        Returns: undefined
      }
      provision_full_catalog_for_tenant: {
        Args: { _branch_id: string; _limit?: number; _tenant_id: string }
        Returns: number
      }
      provision_tenant: { Args: { _tenant_id: string }; Returns: Json }
      push_global_catalog_to_all_tenants: {
        Args: { _limit?: number }
        Returns: Json
      }
      queue_expiry_warnings: { Args: never; Returns: Json }
      recalc_customer_due: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      reconcile_cash_drawer: {
        Args: { _tenant_id: string }
        Returns: {
          actual: number
          expected: number
          register_id: string
          variance: number
        }[]
      }
      reconcile_cash_drawer_impl: {
        Args: { _tenant_id: string }
        Returns: {
          actual: number
          expected: number
          register_id: string
          variance: number
        }[]
      }
      reconcile_financials:
        | { Args: { _tenant_id: string }; Returns: Json }
        | {
            Args: { _persist?: boolean; _tenant_id: string }
            Returns: {
              actual: number
              check_name: string
              details: Json
              expected: number
              variance: number
            }[]
          }
      reconcile_register_session: {
        Args: { _register_id: string }
        Returns: {
          actual_cash: number
          cash_in: number
          cash_out: number
          expected_cash: number
          opening_amount: number
          register_id: string
          variance: number
        }[]
      }
      reconcile_register_session_impl: {
        Args: { _register_id: string }
        Returns: {
          actual_cash: number
          cash_in: number
          cash_out: number
          expected_cash: number
          opening_amount: number
          register_id: string
          variance: number
        }[]
      }
      record_api_request: {
        Args: { _n?: number; _tenant: string }
        Returns: Json
      }
      record_cash_txn: {
        Args: {
          _amount: number
          _notes?: string
          _payment_method?: string
          _reference_id?: string
          _reference_no?: string
          _reference_table?: string
          _register_id: string
          _tenant_id: string
          _type: Database["public"]["Enums"]["cash_txn_type"]
        }
        Returns: {
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_method: string | null
          reference_id: string | null
          reference_no: string | null
          reference_table: string | null
          register_id: string
          tenant_id: string
          transaction_type: Database["public"]["Enums"]["cash_txn_type"]
        }
        SetofOptions: {
          from: "*"
          to: "cash_register_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_storage_usage: {
        Args: { _mb: number; _tenant: string }
        Returns: Json
      }
      record_supplier_payment: {
        Args: {
          _amount: number
          _method?: string
          _notes?: string
          _payment_date?: string
          _reference?: string
          _register_id?: string
          _supplier_id: string
          _tenant_id: string
        }
        Returns: string
      }
      refresh_clinical_dashboard: { Args: never; Returns: undefined }
      refresh_perf_matviews: { Args: never; Returns: undefined }
      refund_subscription_payment: {
        Args: { _payment_id: string; _reason?: string }
        Returns: Json
      }
      register_pharmacy_store: {
        Args: {
          _address?: string
          _district?: string
          _email: string
          _mobile: string
          _owner_name: string
          _pharmacy_name: string
          _trade_license?: string
        }
        Returns: string
      }
      reject_global_contribution: {
        Args: { _id: string; _notes: string }
        Returns: undefined
      }
      reject_match_review: {
        Args: { _id: string; _notes?: string }
        Returns: undefined
      }
      reject_purchase_return: {
        Args: { _reason: string; _return_id: string; _tenant_id: string }
        Returns: Json
      }
      reject_purchase_return_impl: {
        Args: { _reason: string; _return_id: string; _tenant_id: string }
        Returns: Json
      }
      reject_subscription_payment: {
        Args: { _notes?: string; _payment_id: string }
        Returns: {
          amount: number
          auto_renewal_attempted_at: string | null
          billing_cycle: string
          callback_ip: string | null
          callback_nonce: string | null
          callback_processed_at: string | null
          callback_user_agent: string | null
          created_at: string
          currency: string
          gateway: string | null
          gateway_error: string | null
          gateway_payment_id: string | null
          gateway_response: Json | null
          gateway_retry_count: number
          gateway_transaction_id: string | null
          id: string
          method: string
          notes: string | null
          payment_status: string | null
          plan_id: string | null
          processed_at: string | null
          proof_url: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          subscription_id: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscription_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      renew_subscription: {
        Args: { _months: number; _tenant: string }
        Returns: undefined
      }
      replace_sale_invoice: {
        Args: {
          _cashier_id: string
          _client_op_id?: string
          _customer_id: string
          _discount?: number
          _items?: Json
          _notes?: string
          _original_sale_id: string
          _payments?: Json
          _register_id?: string
          _tenant_id: string
        }
        Returns: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_default_branch: { Args: { _tenant: string }; Returns: string }
      resolve_default_supplier: {
        Args: { _tenant_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      resolve_default_supplier_impl: {
        Args: { _tenant_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      resolve_inventory_account: {
        Args: { _kind: string; _tenant: string }
        Returns: string
      }
      resolve_master_id: {
        Args: {
          _actor?: string
          _branch?: string
          _kind: string
          _name: string
          _status?: string
          _tenant: string
        }
        Returns: string
      }
      resolve_product_revive_first: { Args: { _payload: Json }; Returns: Json }
      resolve_product_revive_first_impl: {
        Args: { _payload: Json }
        Returns: Json
      }
      resolve_product_vat: {
        Args: { _product_id: string; _tenant_id: string }
        Returns: Record<string, unknown>
      }
      resolve_product_vat_impl: {
        Args: { _product_id: string; _tenant_id: string }
        Returns: Record<string, unknown>
      }
      resolve_user_branch: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: string
      }
      revalue_batch_cost: {
        Args: {
          _batch_id: string
          _new_cost: number
          _reason: string
          _tenant_id: string
        }
        Returns: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          new_cost: number
          old_cost: number
          reason: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_revaluation_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_journal: {
        Args: { _journal_id: string; _reason: string }
        Returns: string
      }
      rollback_product_import: { Args: { p_batch_id: string }; Returns: Json }
      rollback_product_import_impl: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      rollback_product_import_v2: { Args: { _job: string }; Returns: Json }
      rollback_product_import_v2_impl: { Args: { _job: string }; Returns: Json }
      run_financial_drift_scan: {
        Args: { _tenant_id: string }
        Returns: number
      }
      run_go_live_check: { Args: { _tenant_id: string }; Returns: Json }
      sale_cancel_rpc: {
        Args: { _reason?: string; _sale_id: string; _tenant_id: string }
        Returns: {
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          client_op_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          due: number
          id: string
          invoice_no: string
          is_return: boolean
          notes: string | null
          original_sale_id: string | null
          paid: number
          payment_method: string
          return_reason: Database["public"]["Enums"]["return_reason"] | null
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat: number
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_purchase_requisition: {
        Args: { payload: Json }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          estimated_amount: number
          expected_date: string | null
          id: string
          pr_number: string
          rejected_reason: string | null
          remarks: string | null
          requisition_date: string
          status: Database["public"]["Enums"]["purchase_requisition_status"]
          supplier_id: string | null
          tenant_id: string
          total_items: number
          total_qty: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchase_requisitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      scan_product_duplicates: { Args: { _tenant_id: string }; Returns: Json }
      scan_product_duplicates_impl: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      score_contribution_quality: {
        Args: { _contribution_id: string }
        Returns: number
      }
      search_global_medicines: {
        Args: { _limit?: number; _q: string; _tenant: string }
        Returns: {
          already_in_catalog: boolean
          already_in_stock: boolean
          brand_name: string
          dosage_form: string
          generic_name: string
          id: string
          manufacturer: string
          source: string
          strength: string
        }[]
      }
      search_global_medicines_impl: {
        Args: { _limit?: number; _q: string; _tenant: string }
        Returns: {
          already_in_catalog: boolean
          already_in_stock: boolean
          brand_name: string
          dosage_form: string
          generic_name: string
          id: string
          manufacturer: string
          source: string
          strength: string
        }[]
      }
      search_products: {
        Args: {
          _branch_id?: string
          _limit?: number
          _offset?: number
          _query: string
          _tenant_id: string
          _warehouse_id?: string
        }
        Returns: {
          barcode: string
          category_name: string
          effective_price: number
          generic_name: string
          id: string
          manufacturer_name: string
          medicine_type: string
          name: string
          nearest_expiry: string
          pack_size: number
          purchase_price: number
          qty_on_hand: number
          retail_price: number
          sku: string
          strength: string
          vat_rate: number
          volume: string
        }[]
      }
      seed_default_chart: { Args: { _tenant_id: string }; Returns: undefined }
      seed_global_contributions: { Args: { _limit?: number }; Returns: Json }
      set_purchase_requisition_status: {
        Args: {
          _id: string
          _reason?: string
          _status: string
          _tenant_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          estimated_amount: number
          expected_date: string | null
          id: string
          pr_number: string
          rejected_reason: string | null
          remarks: string | null
          requisition_date: string
          status: Database["public"]["Enums"]["purchase_requisition_status"]
          supplier_id: string | null
          tenant_id: string
          total_items: number
          total_qty: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchase_requisitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_stock_override_allowed: {
        Args: { _allowed: boolean; _tenant_id: string }
        Returns: boolean
      }
      setup_store_basics: {
        Args: {
          _branch_address: string
          _branch_id: string
          _branch_name: string
          _branch_phone: string
          _create_register: boolean
          _register_name: string
          _register_opening: number
          _tenant_id: string
          _warehouse_id: string
          _warehouse_name: string
        }
        Returns: Json
      }
      smart_medicine_search: {
        Args: { _limit?: number; _q: string }
        Returns: {
          brand_name: string
          dosage_form: string
          generic_name: string
          id: string
          manufacturer_name: string
          match_type: string
          score: number
          strength: string
        }[]
      }
      start_global_import_job: {
        Args: {
          _branch: string
          _filter_q: string
          _filter_rx_only: boolean
          _medicine_ids: string[]
          _options: Json
          _scope: string
          _tenant: string
          _warehouse: string
        }
        Returns: string
      }
      stock_transfer_approve: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      stock_transfer_receive: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      stock_transfer_reject: {
        Args: { _reason?: string; _transfer_id: string }
        Returns: undefined
      }
      stock_transfer_request: {
        Args: {
          _from_warehouse_id: string
          _items: Json
          _notes?: string
          _tenant_id: string
          _to_warehouse_id: string
        }
        Returns: string
      }
      supplier_recall: {
        Args: {
          _notes?: string
          _reason: string
          _source?: string
          _supplier_id: string
          _tenant_id: string
        }
        Returns: number
      }
      sync_global_medicine_to_tenant: {
        Args: { _gm_id: string; _tenant_id: string }
        Returns: boolean
      }
      sync_missing_global_medicines: {
        Args: { _limit?: number; _tenant_id: string }
        Returns: number
      }
      tenant_catalog_health: {
        Args: { _tenant: string }
        Returns: {
          coverage_pct: number
          linked: number
          total: number
          unlinked: number
        }[]
      }
      tenant_features: { Args: { _tenant: string }; Returns: Json }
      tenant_subscription_status: {
        Args: { _tenant: string }
        Returns: {
          api_enabled: boolean
          expires_at: string
          grace_until: string
          is_unlimited: boolean
          max_branches: number
          max_users: number
          max_warehouses: number
          plan_code: string
          plan_id: string
          sms_enabled: boolean
          status: string
        }[]
      }
      tenant_subscription_status_impl: {
        Args: { _tenant: string }
        Returns: {
          api_enabled: boolean
          expires_at: string
          grace_until: string
          is_unlimited: boolean
          max_branches: number
          max_users: number
          max_warehouses: number
          plan_code: string
          plan_id: string
          sms_enabled: boolean
          status: string
        }[]
      }
      tenant_usage_summary: {
        Args: { _tenant: string }
        Returns: {
          current_usage: number
          limit_value: number
          metric: string
          usage_percent: number
        }[]
      }
      test_tenant_isolation: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      top_adopted_breakdown: { Args: { _limit?: number }; Returns: Json }
      unified_medicine_search: {
        Args: { _limit?: number; _q: string; _tenant: string }
        Returns: {
          already_in_stock: boolean
          brand_name: string
          dosage_form: string
          generic_name: string
          manufacturer_name: string
          prescription_required: boolean
          product_id: string
          result_type: string
          score: number
          strength: string
        }[]
      }
      unread_admin_notifications_count: { Args: never; Returns: number }
      unread_notifications_count: {
        Args: { _tenant_id: string }
        Returns: number
      }
      update_batch_expiry: {
        Args: {
          _batch_id: string
          _new_expiry: string
          _reason?: string
          _tenant_id: string
        }
        Returns: Json
      }
      update_batch_stock: {
        Args: { _batch_id: string; _delta: number }
        Returns: number
      }
      update_landing_cms: {
        Args: { _content_bn: Json; _content_en: Json }
        Returns: undefined
      }
      upgrade_plan: {
        Args: { _plan: string; _tenant: string }
        Returns: undefined
      }
      upsert_product_barcodes: {
        Args: { _rows: Json }
        Returns: {
          id: string
        }[]
      }
      user_branch_ids: {
        Args: { _tenant: string; _user: string }
        Returns: string[]
      }
      user_branch_ids_impl: {
        Args: { _tenant: string; _user: string }
        Returns: string[]
      }
      user_can_access_branch: {
        Args: { _branch_id: string; _tenant_id: string }
        Returns: boolean
      }
      validate_branch_write: {
        Args: { _branch_id: string; _tenant_id: string }
        Returns: Json
      }
      validate_device_policy: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: Json
      }
      validate_device_policy_impl: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: Json
      }
      validate_password_policy: {
        Args: { _password: string; _tenant_id: string }
        Returns: string[]
      }
      validate_password_policy_impl: {
        Args: { _password: string; _tenant_id: string }
        Returns: string[]
      }
      warehouse_kpis: {
        Args: { _tenant_id: string; _warehouse_id: string }
        Returns: {
          expiring_count: number
          low_stock_count: number
          out_of_stock_count: number
          purchase_this_month: number
          sales_this_month: number
          sales_today: number
          stock_value: number
          total_products: number
        }[]
      }
      write_billing_event: {
        Args: {
          _amount?: number
          _currency?: string
          _event_id?: string
          _event_type: string
          _payload: Json
          _status?: string
          _subscription_id: string
          _tenant_id: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "income"
        | "expense"
        | "cogs"
      app_role:
        | "owner"
        | "manager"
        | "pharmacist"
        | "cashier"
        | "staff"
        | "regional_manager"
        | "auditor"
        | "corporate_admin"
      cash_register_status: "open" | "closed"
      cash_txn_type:
        | "opening_balance"
        | "closing_balance"
        | "sale"
        | "sale_refund"
        | "due_collection"
        | "customer_payment"
        | "supplier_payment"
        | "cash_in"
        | "cash_out"
        | "expense"
      contribution_status: "pending" | "approved" | "rejected"
      customer_type: "retail" | "dealer" | "wholesale"
      drug_interaction_severity: "minor" | "moderate" | "major"
      fin_payment_method:
        | "cash"
        | "bank"
        | "bkash"
        | "nagad"
        | "rocket"
        | "card"
        | "cheque"
        | "adjustment"
      interaction_severity: "minor" | "moderate" | "major" | "contraindicated"
      ledger_entry_type:
        | "opening"
        | "sale"
        | "sales_return"
        | "collection"
        | "purchase"
        | "purchase_return"
        | "payment"
        | "adjustment"
      movement_type:
        | "purchase"
        | "sale"
        | "sales_return"
        | "purchase_return"
        | "damage"
        | "expiry"
        | "adjustment"
        | "transfer_in"
        | "transfer_out"
        | "opening"
      party_type: "customer" | "supplier"
      payment_method:
        | "cash"
        | "bkash"
        | "nagad"
        | "rocket"
        | "bank"
        | "card"
        | "other"
      po_status:
        | "draft"
        | "sent"
        | "approved"
        | "partially_received"
        | "received"
        | "cancelled"
      pregnancy_category:
        | "safe"
        | "caution"
        | "avoid"
        | "contraindicated"
        | "unknown"
      purchase_requisition_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      purchase_status:
        | "draft"
        | "received"
        | "void"
        | "returned"
        | "partially_returned"
      quotation_status:
        | "open"
        | "received"
        | "compared"
        | "selected"
        | "closed"
        | "cancelled"
      return_reason:
        | "wrong_product"
        | "damaged"
        | "expired"
        | "customer_request"
        | "supplier_request"
        | "other"
      rx_review_status: "pending" | "approved" | "overridden" | "rejected"
      sale_status:
        | "draft"
        | "completed"
        | "void"
        | "returned"
        | "partially_returned"
        | "partial"
      tenant_plan: "free" | "starter" | "pro" | "enterprise"
      tenant_type:
        | "single"
        | "multi_branch"
        | "chain"
        | "hospital"
        | "franchise"
        | "white_label"
      transfer_status:
        | "requested"
        | "approved"
        | "in_transit"
        | "received"
        | "rejected"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "asset",
        "liability",
        "equity",
        "income",
        "expense",
        "cogs",
      ],
      app_role: [
        "owner",
        "manager",
        "pharmacist",
        "cashier",
        "staff",
        "regional_manager",
        "auditor",
        "corporate_admin",
      ],
      cash_register_status: ["open", "closed"],
      cash_txn_type: [
        "opening_balance",
        "closing_balance",
        "sale",
        "sale_refund",
        "due_collection",
        "customer_payment",
        "supplier_payment",
        "cash_in",
        "cash_out",
        "expense",
      ],
      contribution_status: ["pending", "approved", "rejected"],
      customer_type: ["retail", "dealer", "wholesale"],
      drug_interaction_severity: ["minor", "moderate", "major"],
      fin_payment_method: [
        "cash",
        "bank",
        "bkash",
        "nagad",
        "rocket",
        "card",
        "cheque",
        "adjustment",
      ],
      interaction_severity: ["minor", "moderate", "major", "contraindicated"],
      ledger_entry_type: [
        "opening",
        "sale",
        "sales_return",
        "collection",
        "purchase",
        "purchase_return",
        "payment",
        "adjustment",
      ],
      movement_type: [
        "purchase",
        "sale",
        "sales_return",
        "purchase_return",
        "damage",
        "expiry",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "opening",
      ],
      party_type: ["customer", "supplier"],
      payment_method: [
        "cash",
        "bkash",
        "nagad",
        "rocket",
        "bank",
        "card",
        "other",
      ],
      po_status: [
        "draft",
        "sent",
        "approved",
        "partially_received",
        "received",
        "cancelled",
      ],
      pregnancy_category: [
        "safe",
        "caution",
        "avoid",
        "contraindicated",
        "unknown",
      ],
      purchase_requisition_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
      ],
      purchase_status: [
        "draft",
        "received",
        "void",
        "returned",
        "partially_returned",
      ],
      quotation_status: [
        "open",
        "received",
        "compared",
        "selected",
        "closed",
        "cancelled",
      ],
      return_reason: [
        "wrong_product",
        "damaged",
        "expired",
        "customer_request",
        "supplier_request",
        "other",
      ],
      rx_review_status: ["pending", "approved", "overridden", "rejected"],
      sale_status: [
        "draft",
        "completed",
        "void",
        "returned",
        "partially_returned",
        "partial",
      ],
      tenant_plan: ["free", "starter", "pro", "enterprise"],
      tenant_type: [
        "single",
        "multi_branch",
        "chain",
        "hospital",
        "franchise",
        "white_label",
      ],
      transfer_status: [
        "requested",
        "approved",
        "in_transit",
        "received",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const
