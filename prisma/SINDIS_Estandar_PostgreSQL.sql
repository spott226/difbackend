-- ============================================================
-- SINDIS - Modelo PostgreSQL con estándar de nombres
-- Estándar aplicado:
--   Cat = Catálogos
--   Bit = Procesos / bitácoras operativas
--   Rel = Relaciones
--   Sis = Sistema
--   e = entero, d = decimal, t = texto, fh = fecha/timestamp,
--   tm = hora, b = booleano, eCod/tCod = llaves/códigos relacionados
-- ============================================================

BEGIN;

-- ============================================================
-- SISTEMA
-- ============================================================

CREATE TABLE "CatRoles" (
  "eCodRol" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(80) NOT NULL,
  "tDescripcion" TEXT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKCatRoles" PRIMARY KEY ("eCodRol"),
  CONSTRAINT "UQCatRolesTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "SisUsuarios" (
  "eCodUsuario" INTEGER GENERATED ALWAYS AS IDENTITY,
  "eCodRol" INTEGER NOT NULL,
  "tUsuario" VARCHAR(80) NOT NULL,
  "tNombreMostrar" VARCHAR(160) NOT NULL,
  "tContrasenaHash" TEXT NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fhActualizacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKSisUsuarios" PRIMARY KEY ("eCodUsuario"),
  CONSTRAINT "UQSisUsuariosTUsuario" UNIQUE ("tUsuario"),
  CONSTRAINT "FKCatRolesSisUsuarios01" FOREIGN KEY ("eCodRol")
    REFERENCES "CatRoles" ("eCodRol") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "SisAuditorias" (
  "eCodAuditoria" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodUsuario" INTEGER NULL,
  "tAccion" VARCHAR(120) NOT NULL,
  "tTabla" VARCHAR(120) NOT NULL,
  "tCodRegistro" VARCHAR(120) NULL,
  "tIp" VARCHAR(60) NULL,
  "tDetalle" TEXT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKSisAuditorias" PRIMARY KEY ("eCodAuditoria"),
  CONSTRAINT "FKSisUsuariosSisAuditorias01" FOREIGN KEY ("eCodUsuario")
    REFERENCES "SisUsuarios" ("eCodUsuario") ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- CATÁLOGOS
-- ============================================================

CREATE TABLE "CatSexos" (
  "eCodSexo" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(40) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatSexos" PRIMARY KEY ("eCodSexo"),
  CONSTRAINT "UQCatSexosTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatTiposZona" (
  "eCodTipoZona" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(60) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatTiposZona" PRIMARY KEY ("eCodTipoZona"),
  CONSTRAINT "UQCatTiposZonaTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatMunicipios" (
  "eCodMunicipio" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(120) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatMunicipios" PRIMARY KEY ("eCodMunicipio"),
  CONSTRAINT "UQCatMunicipiosTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatLocalidades" (
  "eCodLocalidad" INTEGER GENERATED ALWAYS AS IDENTITY,
  "eCodMunicipio" INTEGER NOT NULL,
  "eCodTipoZona" INTEGER NOT NULL,
  "tNombre" VARCHAR(160) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatLocalidades" PRIMARY KEY ("eCodLocalidad"),
  CONSTRAINT "UQCatLocalidadesECodMunicipioTNombre" UNIQUE ("eCodMunicipio", "tNombre"),
  CONSTRAINT "FKCatMunicipiosCatLocalidades01" FOREIGN KEY ("eCodMunicipio")
    REFERENCES "CatMunicipios" ("eCodMunicipio") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatTiposZonaCatLocalidades01" FOREIGN KEY ("eCodTipoZona")
    REFERENCES "CatTiposZona" ("eCodTipoZona") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "CatTiposDiscapacidad" (
  "eCodTipoDiscapacidad" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(120) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatTiposDiscapacidad" PRIMARY KEY ("eCodTipoDiscapacidad"),
  CONSTRAINT "UQCatTiposDiscapacidadTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatCausasDiscapacidad" (
  "eCodCausaDiscapacidad" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(120) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatCausasDiscapacidad" PRIMARY KEY ("eCodCausaDiscapacidad"),
  CONSTRAINT "UQCatCausasDiscapacidadTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatGradosFuncionales" (
  "eCodGradoFuncional" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(120) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatGradosFuncionales" PRIMARY KEY ("eCodGradoFuncional"),
  CONSTRAINT "UQCatGradosFuncionalesTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatDerechohabiencias" (
  "eCodDerechohabiencia" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(120) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatDerechohabiencias" PRIMARY KEY ("eCodDerechohabiencia"),
  CONSTRAINT "UQCatDerechohabienciasTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatServiciosMedicos" (
  "eCodServicioMedico" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(180) NOT NULL,
  "tDescripcion" TEXT NULL,
  "bGratuito" BOOLEAN NOT NULL DEFAULT TRUE,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatServiciosMedicos" PRIMARY KEY ("eCodServicioMedico"),
  CONSTRAINT "UQCatServiciosMedicosTNombre" UNIQUE ("tNombre")
);

CREATE TABLE "CatTiposApoyo" (
  "eCodTipoApoyo" INTEGER GENERATED ALWAYS AS IDENTITY,
  "tNombre" VARCHAR(160) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PKCatTiposApoyo" PRIMARY KEY ("eCodTipoApoyo"),
  CONSTRAINT "UQCatTiposApoyoTNombre" UNIQUE ("tNombre")
);

-- ============================================================
-- PROCESOS PRINCIPALES
-- ============================================================

CREATE TABLE "BitBeneficiarios" (
  "eCodBeneficiario" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodSexo" INTEGER NOT NULL,
  "tCodSns" VARCHAR(40) NOT NULL,
  "tCodSoluciones" VARCHAR(40) NOT NULL,
  "tCurp" VARCHAR(18) NOT NULL,
  "tNombre" VARCHAR(120) NOT NULL,
  "tApellidoPaterno" VARCHAR(120) NOT NULL,
  "tApellidoMaterno" VARCHAR(120) NULL,
  "fhNacimiento" DATE NOT NULL,
  "fhApertura" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tOcupacion" VARCHAR(160) NULL,
  "tLugarNacimiento" VARCHAR(160) NULL,
  "tCorreo" VARCHAR(180) NULL,
  "tEstadoCivil" VARCHAR(80) NULL,
  "tNivelEscolar" VARCHAR(120) NULL,
  "tTelefono" VARCHAR(40) NULL,
  "bTrabaja" BOOLEAN NOT NULL DEFAULT FALSE,
  "bJefeFamilia" BOOLEAN NOT NULL DEFAULT FALSE,
  "tRutaFoto" TEXT NULL,
  "tTokenEmergenciaHash" TEXT NOT NULL,
  "tTokenEmergenciaUltimos4" VARCHAR(4) NOT NULL,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fhActualizacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitBeneficiarios" PRIMARY KEY ("eCodBeneficiario"),
  CONSTRAINT "UQBitBeneficiariosTCodSns" UNIQUE ("tCodSns"),
  CONSTRAINT "UQBitBeneficiariosTCodSoluciones" UNIQUE ("tCodSoluciones"),
  CONSTRAINT "UQBitBeneficiariosTCurp" UNIQUE ("tCurp"),
  CONSTRAINT "UQBitBeneficiariosTTokenEmergenciaHash" UNIQUE ("tTokenEmergenciaHash"),
  CONSTRAINT "FKCatSexosBitBeneficiarios01" FOREIGN KEY ("eCodSexo")
    REFERENCES "CatSexos" ("eCodSexo") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitDomiciliosBeneficiarios" (
  "eCodDomicilioBeneficiario" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "eCodMunicipio" INTEGER NOT NULL,
  "eCodLocalidad" INTEGER NOT NULL,
  "eCodTipoZona" INTEGER NOT NULL,
  "tEstado" VARCHAR(80) NOT NULL DEFAULT 'Aguascalientes',
  "tColonia" VARCHAR(160) NULL,
  "tCodigoPostal" VARCHAR(12) NULL,
  "tCalle" VARCHAR(180) NOT NULL,
  "tNumeroExterior" VARCHAR(40) NULL,
  "tNumeroInterior" VARCHAR(40) NULL,
  "tTipoVivienda" VARCHAR(120) NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitDomiciliosBeneficiarios" PRIMARY KEY ("eCodDomicilioBeneficiario"),
  CONSTRAINT "UQBitDomiciliosBeneficiariosECodBeneficiario" UNIQUE ("eCodBeneficiario"),
  CONSTRAINT "FKBitBeneficiariosBitDomiciliosBeneficiarios01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatMunicipiosBitDomiciliosBeneficiarios01" FOREIGN KEY ("eCodMunicipio")
    REFERENCES "CatMunicipios" ("eCodMunicipio") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatLocalidadesBitDomiciliosBeneficiarios01" FOREIGN KEY ("eCodLocalidad")
    REFERENCES "CatLocalidades" ("eCodLocalidad") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatTiposZonaBitDomiciliosBeneficiarios01" FOREIGN KEY ("eCodTipoZona")
    REFERENCES "CatTiposZona" ("eCodTipoZona") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitPerfilesDiscapacidad" (
  "eCodPerfilDiscapacidad" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "eCodTipoDiscapacidad" INTEGER NOT NULL,
  "eCodCausaDiscapacidad" INTEGER NULL,
  "eCodGradoFuncional" INTEGER NULL,
  "tDiagnosticoMedico" TEXT NOT NULL,
  "tObservacionesMedicas" TEXT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitPerfilesDiscapacidad" PRIMARY KEY ("eCodPerfilDiscapacidad"),
  CONSTRAINT "UQBitPerfilesDiscapacidadECodBeneficiario" UNIQUE ("eCodBeneficiario"),
  CONSTRAINT "FKBitBeneficiariosBitPerfilesDiscapacidad01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatTiposDiscapacidadBitPerfilesDiscapacidad01" FOREIGN KEY ("eCodTipoDiscapacidad")
    REFERENCES "CatTiposDiscapacidad" ("eCodTipoDiscapacidad") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatCausasDiscapacidadBitPerfilesDiscapacidad01" FOREIGN KEY ("eCodCausaDiscapacidad")
    REFERENCES "CatCausasDiscapacidad" ("eCodCausaDiscapacidad") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatGradosFuncionalesBitPerfilesDiscapacidad01" FOREIGN KEY ("eCodGradoFuncional")
    REFERENCES "CatGradosFuncionales" ("eCodGradoFuncional") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitPerfilesClinicos" (
  "eCodPerfilClinico" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "eCodDerechohabiencia" INTEGER NULL,
  "eCodServicioMedico" INTEGER NULL,
  "tGrupoSanguineo" VARCHAR(8) NULL,
  "tOtroServicioMedico" VARCHAR(180) NULL,
  "tAlergias" TEXT NULL,
  "tMedicamentosActuales" TEXT NULL,
  "tEnfermedadesCronicas" TEXT NULL,
  "tIndicacionesEmergencia" TEXT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitPerfilesClinicos" PRIMARY KEY ("eCodPerfilClinico"),
  CONSTRAINT "UQBitPerfilesClinicosECodBeneficiario" UNIQUE ("eCodBeneficiario"),
  CONSTRAINT "FKBitBeneficiariosBitPerfilesClinicos01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatDerechohabienciasBitPerfilesClinicos01" FOREIGN KEY ("eCodDerechohabiencia")
    REFERENCES "CatDerechohabiencias" ("eCodDerechohabiencia") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatServiciosMedicosBitPerfilesClinicos01" FOREIGN KEY ("eCodServicioMedico")
    REFERENCES "CatServiciosMedicos" ("eCodServicioMedico") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitEstudiosSocioeconomicos" (
  "eCodEstudioSocioeconomico" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "dIngresoHogar" NUMERIC(12,2) NULL,
  "eDependientes" INTEGER NULL,
  "tSituacionVivienda" VARCHAR(160) NULL,
  "tServicios" TEXT NULL,
  "tTipoFamilia" VARCHAR(160) NULL,
  "tTipoIngreso" VARCHAR(160) NULL,
  "dMontoRenta" NUMERIC(12,2) NULL,
  "eAniosVivienda" INTEGER NULL,
  "eRecamaras" INTEGER NULL,
  "eBanos" INTEGER NULL,
  "ePisos" INTEGER NULL,
  "tMaterialTecho" VARCHAR(160) NULL,
  "tMaterialPiso" VARCHAR(160) NULL,
  "tMaterialPared" VARCHAR(160) NULL,
  "tHigiene" TEXT NULL,
  "tBienesMuebles" TEXT NULL,
  "tServiciosBasicos" TEXT NULL,
  "tDetalleIngresos" TEXT NULL,
  "tDetalleEgresos" TEXT NULL,
  "tIntegrantesFamilia" TEXT NULL,
  "tFrecuenciaAlimentos" TEXT NULL,
  "tDiagnosticoSalud" TEXT NULL,
  "tMotivacion" TEXT NULL,
  "tMotivoDif" TEXT NULL,
  "tInstitucion" VARCHAR(180) NULL,
  "fhResolucion" DATE NULL,
  "fhOficio" DATE NULL,
  "tDiagnosticoFinal" TEXT NULL,
  "tResumen" TEXT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitEstudiosSocioeconomicos" PRIMARY KEY ("eCodEstudioSocioeconomico"),
  CONSTRAINT "UQBitEstudiosSocioeconomicosECodBeneficiario" UNIQUE ("eCodBeneficiario"),
  CONSTRAINT "FKBitBeneficiariosBitEstudiosSocioeconomicos01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitNotasPsicologia" (
  "eCodNotaPsicologia" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "tNota" TEXT NOT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitNotasPsicologia" PRIMARY KEY ("eCodNotaPsicologia"),
  CONSTRAINT "FKBitBeneficiariosBitNotasPsicologia01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitKardex" (
  "eCodKardex" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "tTitulo" VARCHAR(160) NOT NULL,
  "tDetalle" TEXT NOT NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitKardex" PRIMARY KEY ("eCodKardex"),
  CONSTRAINT "FKBitBeneficiariosBitKardex01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE "BitApoyos" (
  "eCodApoyo" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "eCodTipoApoyo" INTEGER NULL,
  "tNombre" VARCHAR(180) NOT NULL,
  "tInstitucion" VARCHAR(180) NULL,
  "tNotas" TEXT NULL,
  "fhEntrega" TIMESTAMP NULL,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKBitApoyos" PRIMARY KEY ("eCodApoyo"),
  CONSTRAINT "FKBitBeneficiariosBitApoyos01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FKCatTiposApoyoBitApoyos01" FOREIGN KEY ("eCodTipoApoyo")
    REFERENCES "CatTiposApoyo" ("eCodTipoApoyo") ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- RELACIONES
-- ============================================================

CREATE TABLE "RelBeneficiariosContactosEmergencia" (
  "eCodBeneficiarioContactoEmergencia" BIGINT GENERATED ALWAYS AS IDENTITY,
  "eCodBeneficiario" BIGINT NOT NULL,
  "tNombre" VARCHAR(180) NOT NULL,
  "tParentesco" VARCHAR(80) NOT NULL,
  "tTelefono" VARCHAR(40) NOT NULL,
  "ePrioridad" INTEGER NOT NULL DEFAULT 1,
  "bActivo" BOOLEAN NOT NULL DEFAULT TRUE,
  "fhCreacion" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PKRelBeneficiariosContactosEmergencia" PRIMARY KEY ("eCodBeneficiarioContactoEmergencia"),
  CONSTRAINT "FKBitBeneficiariosRelBeneficiariosContactosEmergencia01" FOREIGN KEY ("eCodBeneficiario")
    REFERENCES "BitBeneficiarios" ("eCodBeneficiario") ON UPDATE CASCADE ON DELETE CASCADE
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX "IXSisUsuariosECodRol" ON "SisUsuarios" ("eCodRol");
CREATE INDEX "IXSisAuditoriasECodUsuario" ON "SisAuditorias" ("eCodUsuario");
CREATE INDEX "IXSisAuditoriasFhCreacion" ON "SisAuditorias" ("fhCreacion");

CREATE INDEX "IXCatLocalidadesECodMunicipio" ON "CatLocalidades" ("eCodMunicipio");
CREATE INDEX "IXBitBeneficiariosTCurp" ON "BitBeneficiarios" ("tCurp");
CREATE INDEX "IXBitBeneficiariosTCodSoluciones" ON "BitBeneficiarios" ("tCodSoluciones");
CREATE INDEX "IXBitBeneficiariosTApellidos" ON "BitBeneficiarios" ("tApellidoPaterno", "tApellidoMaterno", "tNombre");
CREATE INDEX "IXBitDomiciliosBeneficiariosECodMunicipioECodLocalidad" ON "BitDomiciliosBeneficiarios" ("eCodMunicipio", "eCodLocalidad");
CREATE INDEX "IXBitPerfilesDiscapacidadECodTipoDiscapacidad" ON "BitPerfilesDiscapacidad" ("eCodTipoDiscapacidad");
CREATE INDEX "IXBitPerfilesClinicosECodDerechohabiencia" ON "BitPerfilesClinicos" ("eCodDerechohabiencia");
CREATE INDEX "IXBitEstudiosSocioeconomicosECodBeneficiario" ON "BitEstudiosSocioeconomicos" ("eCodBeneficiario");
CREATE INDEX "IXBitNotasPsicologiaECodBeneficiarioFhCreacion" ON "BitNotasPsicologia" ("eCodBeneficiario", "fhCreacion");
CREATE INDEX "IXBitKardexECodBeneficiarioFhCreacion" ON "BitKardex" ("eCodBeneficiario", "fhCreacion");
CREATE INDEX "IXBitApoyosECodBeneficiario" ON "BitApoyos" ("eCodBeneficiario");
CREATE INDEX "IXRelBeneficiariosContactosEmergenciaECodBeneficiario" ON "RelBeneficiariosContactosEmergencia" ("eCodBeneficiario");

-- ============================================================
-- FUNCIONES Y PROCEDIMIENTOS
-- ============================================================

CREATE OR REPLACE FUNCTION "fnNombreCompletoBeneficiario"("eCodBeneficiario" BIGINT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT CONCAT_WS(' ', B."tNombre", B."tApellidoPaterno", B."tApellidoMaterno")
  FROM "BitBeneficiarios" B
  WHERE B."eCodBeneficiario" = "eCodBeneficiario";
$$;

CREATE OR REPLACE PROCEDURE "stpInsertarAuditoria"(
  "eCodUsuario" INTEGER,
  "tAccion" VARCHAR,
  "tTabla" VARCHAR,
  "tCodRegistro" VARCHAR,
  "tIp" VARCHAR,
  "tDetalle" TEXT
)
LANGUAGE SQL
AS $$
  INSERT INTO "SisAuditorias" (
    "eCodUsuario",
    "tAccion",
    "tTabla",
    "tCodRegistro",
    "tIp",
    "tDetalle"
  )
  VALUES (
    "eCodUsuario",
    "tAccion",
    "tTabla",
    "tCodRegistro",
    "tIp",
    "tDetalle"
  );
$$;

CREATE OR REPLACE PROCEDURE "stpInsertarContactoEmergencia"(
  "eCodBeneficiario" BIGINT,
  "tNombre" VARCHAR,
  "tParentesco" VARCHAR,
  "tTelefono" VARCHAR,
  "ePrioridad" INTEGER
)
LANGUAGE SQL
AS $$
  INSERT INTO "RelBeneficiariosContactosEmergencia" (
    "eCodBeneficiario",
    "tNombre",
    "tParentesco",
    "tTelefono",
    "ePrioridad"
  )
  VALUES (
    "eCodBeneficiario",
    "tNombre",
    "tParentesco",
    "tTelefono",
    "ePrioridad"
  );
$$;

CREATE OR REPLACE PROCEDURE "stpEliminarContactoEmergencia"(
  "eCodBeneficiarioContactoEmergencia" BIGINT
)
LANGUAGE SQL
AS $$
  UPDATE "RelBeneficiariosContactosEmergencia"
  SET "bActivo" = FALSE
  WHERE "eCodBeneficiarioContactoEmergencia" = $1;
$$;

-- ============================================================
-- QUERIES DE EJEMPLO
-- ============================================================

-- Consulta general de expediente.
SELECT
  B."eCodBeneficiario",
  B."tCodSoluciones",
  B."tCurp",
  "fnNombreCompletoBeneficiario"(B."eCodBeneficiario") AS "tNombreCompleto",
  TD."tNombre" AS "tTipoDiscapacidad",
  PC."tGrupoSanguineo",
  DH."tNombre" AS "tDerechohabiencia"
FROM "BitBeneficiarios" B
INNER JOIN "BitPerfilesDiscapacidad" PD
  ON PD."eCodBeneficiario" = B."eCodBeneficiario"
INNER JOIN "CatTiposDiscapacidad" TD
  ON TD."eCodTipoDiscapacidad" = PD."eCodTipoDiscapacidad"
LEFT JOIN "BitPerfilesClinicos" PC
  ON PC."eCodBeneficiario" = B."eCodBeneficiario"
LEFT JOIN "CatDerechohabiencias" DH
  ON DH."eCodDerechohabiencia" = PC."eCodDerechohabiencia"
WHERE B."bActivo" = TRUE;

-- Consulta para QR de emergencia.
SELECT
  B."tCodSoluciones",
  B."tCurp",
  B."tNombre",
  B."tApellidoPaterno",
  B."tApellidoMaterno",
  B."tTelefono",
  B."tRutaFoto",
  PC."tGrupoSanguineo",
  PC."tAlergias",
  PC."tMedicamentosActuales",
  PC."tEnfermedadesCronicas",
  PC."tIndicacionesEmergencia",
  TD."tNombre" AS "tTipoDiscapacidad",
  CD."tNombre" AS "tCausaDiscapacidad",
  GF."tNombre" AS "tGradoFuncional",
  PD."tDiagnosticoMedico",
  PD."tObservacionesMedicas"
FROM "BitBeneficiarios" B
INNER JOIN "BitPerfilesDiscapacidad" PD
  ON PD."eCodBeneficiario" = B."eCodBeneficiario"
INNER JOIN "CatTiposDiscapacidad" TD
  ON TD."eCodTipoDiscapacidad" = PD."eCodTipoDiscapacidad"
LEFT JOIN "CatCausasDiscapacidad" CD
  ON CD."eCodCausaDiscapacidad" = PD."eCodCausaDiscapacidad"
LEFT JOIN "CatGradosFuncionales" GF
  ON GF."eCodGradoFuncional" = PD."eCodGradoFuncional"
LEFT JOIN "BitPerfilesClinicos" PC
  ON PC."eCodBeneficiario" = B."eCodBeneficiario"
WHERE B."tTokenEmergenciaHash" = :tTokenEmergenciaHash
  AND B."bActivo" = TRUE;

-- Contactos de emergencia obligados por expediente QR.
SELECT
  R."tNombre",
  R."tParentesco",
  R."tTelefono",
  R."ePrioridad"
FROM "RelBeneficiariosContactosEmergencia" R
WHERE R."eCodBeneficiario" = :eCodBeneficiario
  AND R."bActivo" = TRUE
ORDER BY R."ePrioridad" ASC;

COMMIT;
