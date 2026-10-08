// Generated from the live Supabase project wcjklkpkuhxgfdtbwbuk (schema public) on 2026-10-08 with the Supabase
// connector's generate_typescript_types, then formatted with prettier. Do not edit by hand: regenerate with
//   npx supabase gen types typescript --project-id wcjklkpkuhxgfdtbwbuk --schema public
// whenever a migration lands. Pieces not applied on the live database yet live in database.extra.ts.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      ai_insights: {
        Row: {
          body: string | null;
          created_at: string;
          evidence: Json | null;
          id: number;
          kind: string;
          recommendation: string | null;
          scope: Json;
          severity: string | null;
          title: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          evidence?: Json | null;
          id?: never;
          kind: string;
          recommendation?: string | null;
          scope?: Json;
          severity?: string | null;
          title?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          evidence?: Json | null;
          id?: never;
          kind?: string;
          recommendation?: string | null;
          scope?: Json;
          severity?: string | null;
          title?: string | null;
        };
        Relationships: [];
      };
      ai_reviews: {
        Row: {
          attempt: number;
          checks: Json;
          confidence: number | null;
          created_at: string;
          feedback_worker: Json | null;
          id: number;
          latency_ms: number | null;
          master_comment: string | null;
          master_decided_at: string | null;
          master_id: string | null;
          master_score: number | null;
          master_verdict: Database['public']['Enums']['verdict_t'] | null;
          model: string | null;
          needs_master_review: boolean;
          order_id: number;
          photo: Json | null;
          report_master: Json | null;
          score: number;
          score5: number;
          verdict: Database['public']['Enums']['verdict_t'];
        };
        Insert: {
          attempt: number;
          checks?: Json;
          confidence?: number | null;
          created_at?: string;
          feedback_worker?: Json | null;
          id?: never;
          latency_ms?: number | null;
          master_comment?: string | null;
          master_decided_at?: string | null;
          master_id?: string | null;
          master_score?: number | null;
          master_verdict?: Database['public']['Enums']['verdict_t'] | null;
          model?: string | null;
          needs_master_review?: boolean;
          order_id: number;
          photo?: Json | null;
          report_master?: Json | null;
          score: number;
          score5: number;
          verdict: Database['public']['Enums']['verdict_t'];
        };
        Update: {
          attempt?: number;
          checks?: Json;
          confidence?: number | null;
          created_at?: string;
          feedback_worker?: Json | null;
          id?: never;
          latency_ms?: number | null;
          master_comment?: string | null;
          master_decided_at?: string | null;
          master_id?: string | null;
          master_score?: number | null;
          master_verdict?: Database['public']['Enums']['verdict_t'] | null;
          model?: string | null;
          needs_master_review?: boolean;
          order_id?: number;
          photo?: Json | null;
          report_master?: Json | null;
          score?: number;
          score5?: number;
          verdict?: Database['public']['Enums']['verdict_t'];
        };
        Relationships: [
          {
            foreignKeyName: 'ai_reviews_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_reviews_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_reviews_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_reviews_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_reviews_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
        ];
      };
      areas: {
        Row: {
          code: string;
          id: number;
          name: string;
          sort: number;
        };
        Insert: {
          code: string;
          id: number;
          name: string;
          sort?: number;
        };
        Update: {
          code?: string;
          id?: number;
          name?: string;
          sort?: number;
        };
        Relationships: [];
      };
      brigades: {
        Row: {
          id: number;
          leader_id: string | null;
          name: string;
        };
        Insert: {
          id: number;
          leader_id?: string | null;
          name: string;
        };
        Update: {
          id?: number;
          leader_id?: string | null;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'brigades_leader_fk';
            columns: ['leader_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brigades_leader_fk';
            columns: ['leader_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
        ];
      };
      employees: {
        Row: {
          brigade_id: number | null;
          created_at: string;
          full_name: string;
          grade: number | null;
          id: string;
          on_shift: boolean;
          pseudonym: string;
          role: Database['public']['Enums']['role_t'];
          shift: string | null;
          short_name: string;
          specialty: string | null;
          tab_no: string;
          telegram_chat_id: number | null;
        };
        Insert: {
          brigade_id?: number | null;
          created_at?: string;
          full_name: string;
          grade?: number | null;
          id: string;
          on_shift?: boolean;
          pseudonym: string;
          role: Database['public']['Enums']['role_t'];
          shift?: string | null;
          short_name: string;
          specialty?: string | null;
          tab_no: string;
          telegram_chat_id?: number | null;
        };
        Update: {
          brigade_id?: number | null;
          created_at?: string;
          full_name?: string;
          grade?: number | null;
          id?: string;
          on_shift?: boolean;
          pseudonym?: string;
          role?: Database['public']['Enums']['role_t'];
          shift?: string | null;
          short_name?: string;
          specialty?: string | null;
          tab_no?: string;
          telegram_chat_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'brigades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'v_brigade_status';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment: {
        Row: {
          area_id: number;
          criticality: string;
          id: number;
          inventory_no: string | null;
          is_stopped: boolean;
          name: string;
          qr_token: string | null;
          type: string;
        };
        Insert: {
          area_id: number;
          criticality: string;
          id: number;
          inventory_no?: string | null;
          is_stopped?: boolean;
          name: string;
          qr_token?: string | null;
          type: string;
        };
        Update: {
          area_id?: number;
          criticality?: string;
          id?: number;
          inventory_no?: string | null;
          is_stopped?: boolean;
          name?: string;
          qr_token?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equipment_area_id_fkey';
            columns: ['area_id'];
            isOneToOne: false;
            referencedRelation: 'areas';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_type_specialty: {
        Row: {
          label_plural_dat: string | null;
          specialty: string;
          type: string;
        };
        Insert: {
          label_plural_dat?: string | null;
          specialty: string;
          type: string;
        };
        Update: {
          label_plural_dat?: string | null;
          specialty?: string;
          type?: string;
        };
        Relationships: [];
      };
      fault_codes: {
        Row: {
          code: string;
          grp: string;
          name: string;
          specialty: string;
        };
        Insert: {
          code: string;
          grp: string;
          name: string;
          specialty: string;
        };
        Update: {
          code?: string;
          grp?: string;
          name?: string;
          specialty?: string;
        };
        Relationships: [];
      };
      integration_outbox: {
        Row: {
          created_at: string;
          id: number;
          payload: Json;
          sent_at: string | null;
          topic: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          payload: Json;
          sent_at?: string | null;
          topic: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          payload?: Json;
          sent_at?: string | null;
          topic?: string;
        };
        Relationships: [];
      };
      llm_audit: {
        Row: {
          cost_usd: number | null;
          created_at: string;
          id: number;
          latency_ms: number | null;
          model: string | null;
          purpose: string;
          request_redacted: Json | null;
          response_redacted: Json | null;
        };
        Insert: {
          cost_usd?: number | null;
          created_at?: string;
          id?: never;
          latency_ms?: number | null;
          model?: string | null;
          purpose: string;
          request_redacted?: Json | null;
          response_redacted?: Json | null;
        };
        Update: {
          cost_usd?: number | null;
          created_at?: string;
          id?: never;
          latency_ms?: number | null;
          model?: string | null;
          purpose?: string;
          request_redacted?: Json | null;
          response_redacted?: Json | null;
        };
        Relationships: [];
      };
      materials: {
        Row: {
          id: number;
          name: string;
          sku: string;
          unit: string;
          unit_cost_kzt: number;
        };
        Insert: {
          id: number;
          name: string;
          sku: string;
          unit: string;
          unit_cost_kzt?: number;
        };
        Update: {
          id?: number;
          name?: string;
          sku?: string;
          unit?: string;
          unit_cost_kzt?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          dedupe_key: string;
          id: number;
          kind: string;
          order_id: number | null;
          push_sent_at: string | null;
          read_at: string | null;
          recipient_id: string;
          severity: string;
          tg_sent_at: string | null;
          title: string;
          url: string | null;
        };
        Insert: {
          body: string;
          created_at?: string;
          dedupe_key: string;
          id?: never;
          kind: string;
          order_id?: number | null;
          push_sent_at?: string | null;
          read_at?: string | null;
          recipient_id: string;
          severity?: string;
          tg_sent_at?: string | null;
          title: string;
          url?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          dedupe_key?: string;
          id?: never;
          kind?: string;
          order_id?: number | null;
          push_sent_at?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          severity?: string;
          tg_sent_at?: string | null;
          title?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
        ];
      };
      order_events: {
        Row: {
          action: string;
          actor_id: string | null;
          client_action_id: string | null;
          comment: string | null;
          created_at: string;
          from_status: Database['public']['Enums']['status_t'] | null;
          id: number;
          order_id: number;
          payload: Json;
          reason: string | null;
          to_status: Database['public']['Enums']['status_t'] | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          client_action_id?: string | null;
          comment?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['status_t'] | null;
          id?: never;
          order_id: number;
          payload?: Json;
          reason?: string | null;
          to_status?: Database['public']['Enums']['status_t'] | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          client_action_id?: string | null;
          comment?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['status_t'] | null;
          id?: never;
          order_id?: number;
          payload?: Json;
          reason?: string | null;
          to_status?: Database['public']['Enums']['status_t'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
        ];
      };
      order_materials: {
        Row: {
          id: number;
          material_id: number;
          order_id: number;
          qty: number;
        };
        Insert: {
          id?: never;
          material_id: number;
          order_id: number;
          qty: number;
        };
        Update: {
          id?: never;
          material_id?: number;
          order_id?: number;
          qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_materials_material_id_fkey';
            columns: ['material_id'];
            isOneToOne: false;
            referencedRelation: 'materials';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_materials_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_materials_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_materials_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
        ];
      };
      order_photos: {
        Row: {
          author_id: string | null;
          bytes: number | null;
          captured_at: string | null;
          client_ref: string;
          dhash: string | null;
          exif: Json | null;
          height: number | null;
          id: number;
          kind: Database['public']['Enums']['photo_kind_t'];
          order_id: number | null;
          sha256: string | null;
          source: string;
          storage_path: string;
          uploaded_at: string;
          width: number | null;
        };
        Insert: {
          author_id?: string | null;
          bytes?: number | null;
          captured_at?: string | null;
          client_ref: string;
          dhash?: string | null;
          exif?: Json | null;
          height?: number | null;
          id?: never;
          kind: Database['public']['Enums']['photo_kind_t'];
          order_id?: number | null;
          sha256?: string | null;
          source: string;
          storage_path: string;
          uploaded_at?: string;
          width?: number | null;
        };
        Update: {
          author_id?: string | null;
          bytes?: number | null;
          captured_at?: string | null;
          client_ref?: string;
          dhash?: string | null;
          exif?: Json | null;
          height?: number | null;
          id?: never;
          kind?: Database['public']['Enums']['photo_kind_t'];
          order_id?: number | null;
          sha256?: string | null;
          source?: string;
          storage_path?: string;
          uploaded_at?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_photos_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_photos_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_photos_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_photos_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_photos_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
        ];
      };
      orders: {
        Row: {
          accepted_at: string | null;
          ai_review_id: number | null;
          area_id: number;
          assignee_id: string;
          brigade_id: number | null;
          cancelled_at: string | null;
          client_ref: string;
          closed_at: string | null;
          closing_comment: string | null;
          comment: string | null;
          created_at: string;
          description: string;
          done_at: string | null;
          due_at: string;
          equipment_id: number;
          equipment_stopped: boolean;
          fault_code: string | null;
          final_score: number | null;
          final_verdict: Database['public']['Enums']['verdict_t'] | null;
          id: number;
          is_demo: boolean;
          issued_at: string;
          last_comment: string | null;
          master_id: string;
          norm_hours: number | null;
          number: number;
          paused_since: string | null;
          paused_total_sec: number;
          priority: Database['public']['Enums']['priority_t'];
          queue_position: number | null;
          queued_at: string | null;
          rejected_at: string | null;
          repeat_of_order_id: number | null;
          rework_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['status_t'];
          suggested_fault_code: string | null;
          type: Database['public']['Enums']['order_type_t'];
          works_done: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          ai_review_id?: number | null;
          area_id: number;
          assignee_id: string;
          brigade_id?: number | null;
          cancelled_at?: string | null;
          client_ref: string;
          closed_at?: string | null;
          closing_comment?: string | null;
          comment?: string | null;
          created_at?: string;
          description: string;
          done_at?: string | null;
          due_at: string;
          equipment_id: number;
          equipment_stopped?: boolean;
          fault_code?: string | null;
          final_score?: number | null;
          final_verdict?: Database['public']['Enums']['verdict_t'] | null;
          id?: never;
          is_demo?: boolean;
          issued_at?: string;
          last_comment?: string | null;
          master_id: string;
          norm_hours?: number | null;
          number?: number;
          paused_since?: string | null;
          paused_total_sec?: number;
          priority: Database['public']['Enums']['priority_t'];
          queue_position?: number | null;
          queued_at?: string | null;
          rejected_at?: string | null;
          repeat_of_order_id?: number | null;
          rework_count?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['status_t'];
          suggested_fault_code?: string | null;
          type: Database['public']['Enums']['order_type_t'];
          works_done?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          ai_review_id?: number | null;
          area_id?: number;
          assignee_id?: string;
          brigade_id?: number | null;
          cancelled_at?: string | null;
          client_ref?: string;
          closed_at?: string | null;
          closing_comment?: string | null;
          comment?: string | null;
          created_at?: string;
          description?: string;
          done_at?: string | null;
          due_at?: string;
          equipment_id?: number;
          equipment_stopped?: boolean;
          fault_code?: string | null;
          final_score?: number | null;
          final_verdict?: Database['public']['Enums']['verdict_t'] | null;
          id?: never;
          is_demo?: boolean;
          issued_at?: string;
          last_comment?: string | null;
          master_id?: string;
          norm_hours?: number | null;
          number?: number;
          paused_since?: string | null;
          paused_total_sec?: number;
          priority?: Database['public']['Enums']['priority_t'];
          queue_position?: number | null;
          queued_at?: string | null;
          rejected_at?: string | null;
          repeat_of_order_id?: number | null;
          rework_count?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['status_t'];
          suggested_fault_code?: string | null;
          type?: Database['public']['Enums']['order_type_t'];
          works_done?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_ai_review_fk';
            columns: ['ai_review_id'];
            isOneToOne: false;
            referencedRelation: 'ai_reviews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_area_id_fkey';
            columns: ['area_id'];
            isOneToOne: false;
            referencedRelation: 'areas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'brigades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'v_brigade_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_equipment_id_fkey';
            columns: ['equipment_id'];
            isOneToOne: false;
            referencedRelation: 'equipment';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_fault_code_fkey';
            columns: ['fault_code'];
            isOneToOne: false;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'orders_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
          {
            foreignKeyName: 'orders_suggested_fault_code_fkey';
            columns: ['suggested_fault_code'];
            isOneToOne: false;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      problem_templates: {
        Row: {
          equipment_type: string;
          id: number;
          label: string;
          sort: number;
          suggested_fault_code: string | null;
        };
        Insert: {
          equipment_type: string;
          id: number;
          label: string;
          sort?: number;
          suggested_fault_code?: string | null;
        };
        Update: {
          equipment_type?: string;
          id?: number;
          label?: string;
          sort?: number;
          suggested_fault_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'problem_templates_suggested_fault_code_fkey';
            columns: ['suggested_fault_code'];
            isOneToOne: false;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string;
          device_name: string | null;
          employee_id: string;
          expo_token: string;
          id: number;
          last_seen_at: string | null;
          platform: string | null;
        };
        Insert: {
          created_at?: string;
          device_name?: string | null;
          employee_id: string;
          expo_token: string;
          id?: never;
          last_seen_at?: string | null;
          platform?: string | null;
        };
        Update: {
          created_at?: string;
          device_name?: string | null;
          employee_id?: string;
          expo_token?: string;
          id?: never;
          last_seen_at?: string | null;
          platform?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          key: string;
          value: Json;
        };
        Insert: {
          key: string;
          value: Json;
        };
        Update: {
          key?: string;
          value?: Json;
        };
        Relationships: [];
      };
      tg_link_tokens: {
        Row: {
          employee_id: string;
          expires_at: string;
          token: string;
        };
        Insert: {
          employee_id: string;
          expires_at: string;
          token: string;
        };
        Update: {
          employee_id?: string;
          expires_at?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tg_link_tokens_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tg_link_tokens_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
        ];
      };
      work_norms: {
        Row: {
          fault_code: string;
          norm_hours: number;
          typical: Json;
        };
        Insert: {
          fault_code: string;
          norm_hours: number;
          typical?: Json;
        };
        Update: {
          fault_code?: string;
          norm_hours?: number;
          typical?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'work_norms_fault_code_fkey';
            columns: ['fault_code'];
            isOneToOne: true;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
        ];
      };
    };
    Views: {
      v_brigade_status: {
        Row: {
          busy_count: number | null;
          free_count: number | null;
          id: number | null;
          leader_id: string | null;
          leader_short_name: string | null;
          name: string | null;
          on_shift_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'brigades_leader_fk';
            columns: ['leader_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brigades_leader_fk';
            columns: ['leader_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
        ];
      };
      v_orders: {
        Row: {
          accepted_at: string | null;
          ai_needs_master_review: boolean | null;
          ai_review_id: number | null;
          ai_score: number | null;
          ai_verdict: Database['public']['Enums']['verdict_t'] | null;
          area_id: number | null;
          area_name: string | null;
          assignee_id: string | null;
          assignee_short_name: string | null;
          board_column: string | null;
          brigade_id: number | null;
          brigade_name: string | null;
          cancelled_at: string | null;
          client_ref: string | null;
          closed_at: string | null;
          closing_comment: string | null;
          comment: string | null;
          created_at: string | null;
          description: string | null;
          done_at: string | null;
          due_at: string | null;
          equipment_criticality: string | null;
          equipment_id: number | null;
          equipment_name: string | null;
          equipment_stopped: boolean | null;
          equipment_type: string | null;
          fault_code: string | null;
          final_score: number | null;
          final_verdict: Database['public']['Enums']['verdict_t'] | null;
          id: number | null;
          is_demo: boolean | null;
          is_overdue: boolean | null;
          issued_at: string | null;
          last_comment: string | null;
          last_reason: string | null;
          master_id: string | null;
          master_short_name: string | null;
          norm_hours: number | null;
          number: number | null;
          paused_since: string | null;
          paused_total_sec: number | null;
          priority: Database['public']['Enums']['priority_t'] | null;
          queue_position: number | null;
          queued_at: string | null;
          rejected_at: string | null;
          repeat_of_order_id: number | null;
          rework_count: number | null;
          started_at: string | null;
          status: Database['public']['Enums']['status_t'] | null;
          status_since: string | null;
          suggested_fault_code: string | null;
          type: Database['public']['Enums']['order_type_t'] | null;
          works_done: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_ai_review_fk';
            columns: ['ai_review_id'];
            isOneToOne: false;
            referencedRelation: 'ai_reviews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_area_id_fkey';
            columns: ['area_id'];
            isOneToOne: false;
            referencedRelation: 'areas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'brigades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'v_brigade_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_equipment_id_fkey';
            columns: ['equipment_id'];
            isOneToOne: false;
            referencedRelation: 'equipment';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_fault_code_fkey';
            columns: ['fault_code'];
            isOneToOne: false;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'orders_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_master_id_fkey';
            columns: ['master_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_repeat_of_order_id_fkey';
            columns: ['repeat_of_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_worker_status';
            referencedColumns: ['current_order_id'];
          },
          {
            foreignKeyName: 'orders_suggested_fault_code_fkey';
            columns: ['suggested_fault_code'];
            isOneToOne: false;
            referencedRelation: 'fault_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      v_worker_status: {
        Row: {
          brigade_id: number | null;
          current_equipment_name: string | null;
          current_order_id: number | null;
          current_order_number: number | null;
          grade: number | null;
          id: string | null;
          on_shift: boolean | null;
          queue_count: number | null;
          shift: string | null;
          short_name: string | null;
          specialty: string | null;
          status: string | null;
          tab_no: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'brigades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_brigade_id_fkey';
            columns: ['brigade_id'];
            isOneToOne: false;
            referencedRelation: 'v_brigade_status';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      ai_check_rules: {
        Args: { p_order_id: number };
        Returns: {
          attempt: number;
          checks: Json;
          confidence: number | null;
          created_at: string;
          feedback_worker: Json | null;
          id: number;
          latency_ms: number | null;
          master_comment: string | null;
          master_decided_at: string | null;
          master_id: string | null;
          master_score: number | null;
          master_verdict: Database['public']['Enums']['verdict_t'] | null;
          model: string | null;
          needs_master_review: boolean;
          order_id: number;
          photo: Json | null;
          report_master: Json | null;
          score: number;
          score5: number;
          verdict: Database['public']['Enums']['verdict_t'];
        };
        SetofOptions: {
          from: '*';
          to: 'ai_reviews';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ai_context: { Args: { p_order_id: number }; Returns: Json };
      ai_submit: {
        Args: { p_llm?: Json; p_meta?: Json; p_order_id: number };
        Returns: {
          attempt: number;
          checks: Json;
          confidence: number | null;
          created_at: string;
          feedback_worker: Json | null;
          id: number;
          latency_ms: number | null;
          master_comment: string | null;
          master_decided_at: string | null;
          master_id: string | null;
          master_score: number | null;
          master_verdict: Database['public']['Enums']['verdict_t'] | null;
          model: string | null;
          needs_master_review: boolean;
          order_id: number;
          photo: Json | null;
          report_master: Json | null;
          score: number;
          score5: number;
          verdict: Database['public']['Enums']['verdict_t'];
        };
        SetofOptions: {
          from: '*';
          to: 'ai_reviews';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      analytics_bundle: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      attach_photo: {
        Args: { p: Json };
        Returns: {
          author_id: string | null;
          bytes: number | null;
          captured_at: string | null;
          client_ref: string;
          dhash: string | null;
          exif: Json | null;
          height: number | null;
          id: number;
          kind: Database['public']['Enums']['photo_kind_t'];
          order_id: number | null;
          sha256: string | null;
          source: string;
          storage_path: string;
          uploaded_at: string;
          width: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'order_photos';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_order: {
        Args: { p: Json; p_client_action_id?: string };
        Returns: {
          accepted_at: string | null;
          ai_review_id: number | null;
          area_id: number;
          assignee_id: string;
          brigade_id: number | null;
          cancelled_at: string | null;
          client_ref: string;
          closed_at: string | null;
          closing_comment: string | null;
          comment: string | null;
          created_at: string;
          description: string;
          done_at: string | null;
          due_at: string;
          equipment_id: number;
          equipment_stopped: boolean;
          fault_code: string | null;
          final_score: number | null;
          final_verdict: Database['public']['Enums']['verdict_t'] | null;
          id: number;
          is_demo: boolean;
          issued_at: string;
          last_comment: string | null;
          master_id: string;
          norm_hours: number | null;
          number: number;
          paused_since: string | null;
          paused_total_sec: number;
          priority: Database['public']['Enums']['priority_t'];
          queue_position: number | null;
          queued_at: string | null;
          rejected_at: string | null;
          repeat_of_order_id: number | null;
          rework_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['status_t'];
          suggested_fault_code: string | null;
          type: Database['public']['Enums']['order_type_t'];
          works_done: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      d_materials: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_post_ppr: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_repeat_faults: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_time_patterns: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_top_areas: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_top_equipment: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_trend: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      d_worker_repeats: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      dashboard: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      demo_reset: { Args: never; Returns: Json };
      insight_cards: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      is_staff: { Args: never; Returns: boolean };
      my_role: { Args: never; Returns: Database['public']['Enums']['role_t'] };
      order_action: {
        Args: {
          p_action: string;
          p_client_action_id?: string;
          p_order_id: number;
          p_payload?: Json;
        };
        Returns: {
          accepted_at: string | null;
          ai_review_id: number | null;
          area_id: number;
          assignee_id: string;
          brigade_id: number | null;
          cancelled_at: string | null;
          client_ref: string;
          closed_at: string | null;
          closing_comment: string | null;
          comment: string | null;
          created_at: string;
          description: string;
          done_at: string | null;
          due_at: string;
          equipment_id: number;
          equipment_stopped: boolean;
          fault_code: string | null;
          final_score: number | null;
          final_verdict: Database['public']['Enums']['verdict_t'] | null;
          id: number;
          is_demo: boolean;
          issued_at: string;
          last_comment: string | null;
          master_id: string;
          norm_hours: number | null;
          number: number;
          paused_since: string | null;
          paused_total_sec: number;
          priority: Database['public']['Enums']['priority_t'];
          queue_position: number | null;
          queued_at: string | null;
          rejected_at: string | null;
          repeat_of_order_id: number | null;
          rework_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['status_t'];
          suggested_fault_code: string | null;
          type: Database['public']['Enums']['order_type_t'];
          works_done: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      order_system_action: {
        Args: { p_action: string; p_order_id: number; p_payload?: Json };
        Returns: {
          accepted_at: string | null;
          ai_review_id: number | null;
          area_id: number;
          assignee_id: string;
          brigade_id: number | null;
          cancelled_at: string | null;
          client_ref: string;
          closed_at: string | null;
          closing_comment: string | null;
          comment: string | null;
          created_at: string;
          description: string;
          done_at: string | null;
          due_at: string;
          equipment_id: number;
          equipment_stopped: boolean;
          fault_code: string | null;
          final_score: number | null;
          final_verdict: Database['public']['Enums']['verdict_t'] | null;
          id: number;
          is_demo: boolean;
          issued_at: string;
          last_comment: string | null;
          master_id: string;
          norm_hours: number | null;
          number: number;
          paused_since: string | null;
          paused_total_sec: number;
          priority: Database['public']['Enums']['priority_t'];
          queue_position: number | null;
          queued_at: string | null;
          rejected_at: string | null;
          repeat_of_order_id: number | null;
          rework_count: number;
          started_at: string | null;
          status: Database['public']['Enums']['status_t'];
          suggested_fault_code: string | null;
          type: Database['public']['Enums']['order_type_t'];
          works_done: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rating: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: {
          brigade_id: number;
          closed: number;
          d: number;
          f: number;
          id: string;
          kind: string;
          name: string;
          note: string;
          q: number;
          rank: number;
          score: number;
          t: number;
          v: number;
        }[];
      };
      register_push_token: {
        Args: { p_device_name?: string; p_platform?: string; p_token: string };
        Returns: undefined;
      };
      set_on_shift: {
        Args: { p_employee_id: string; p_on_shift: boolean };
        Returns: undefined;
      };
      set_setting: {
        Args: { p_key: string; p_value: Json };
        Returns: {
          key: string;
          value: Json;
        };
        SetofOptions: {
          from: '*';
          to: 'settings';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      shift_report: {
        Args: { p_filters?: Json; p_from: string; p_to: string };
        Returns: Json;
      };
      suggest_assignees: {
        Args: {
          p_equipment_id: number;
          p_exclude?: string;
          p_required_specialty?: string;
        };
        Returns: {
          employee_id: string;
          reasons: string[];
          score: number;
          short_name: string;
          status: string;
        }[];
      };
      unregister_push_token: { Args: { p_token: string }; Returns: undefined };
    };
    Enums: {
      order_type_t: 'planned' | 'unplanned';
      pause_t: 'waiting_parts' | 'waiting_stop' | 'waiting_permit' | 'other';
      photo_kind_t: 'before' | 'after';
      priority_t: 'emergency' | 'high' | 'normal' | 'planned';
      reject_t: 'no_materials' | 'no_permit' | 'busy_emergency' | 'equipment_running' | 'other';
      role_t: 'master' | 'worker' | 'manager' | 'admin';
      status_t:
        | 'issued'
        | 'accepted'
        | 'queued'
        | 'rejected'
        | 'in_progress'
        | 'paused'
        | 'done'
        | 'ai_review'
        | 'rework'
        | 'closed'
        | 'cancelled';
      verdict_t: 'accepted' | 'accepted_with_remarks' | 'rework';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      order_type_t: ['planned', 'unplanned'],
      pause_t: ['waiting_parts', 'waiting_stop', 'waiting_permit', 'other'],
      photo_kind_t: ['before', 'after'],
      priority_t: ['emergency', 'high', 'normal', 'planned'],
      reject_t: ['no_materials', 'no_permit', 'busy_emergency', 'equipment_running', 'other'],
      role_t: ['master', 'worker', 'manager', 'admin'],
      status_t: [
        'issued',
        'accepted',
        'queued',
        'rejected',
        'in_progress',
        'paused',
        'done',
        'ai_review',
        'rework',
        'closed',
        'cancelled',
      ],
      verdict_t: ['accepted', 'accepted_with_remarks', 'rework'],
    },
  },
} as const;
