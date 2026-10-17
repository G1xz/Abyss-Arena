-- Personagens podem custar 0 pontos (tabela inicial importada da Abyss Cup).
ALTER TABLE "CharacterPrice" DROP CONSTRAINT "CharacterPrice_cost_positive";
ALTER TABLE "CharacterPrice" ADD CONSTRAINT "CharacterPrice_cost_nonnegative" CHECK ("cost" >= 0);
