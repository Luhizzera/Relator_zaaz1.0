// @ts-nocheck
import jsPDF from 'jspdf';
import { ManutencaoOrdem, STATUS_LABEL, PRIORIDADE_LABEL } from '@/types/manutencao';

/**
 * Exporta um resumo em PDF de uma OS de manutenção — número, situação,
 * localização, checklist, materiais e ocorrências. Diferente do motor de
 * relatório fotográfico (pdfEngine.ts): aqui é só texto/tabela, sem grade de
 * fotos (a aba Fotos já cobre a visualização/download das imagens).
 */
export function exportManutencaoPdf(ordem: ManutencaoOrdem): void {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const margin = 14;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const YELLOW = [234, 179, 8];
  const DARK = [30, 41, 59];
  const GRAY = [100, 116, 139];

  const ensureSpace = (needed: number) => {
    if (y + needed > 280) {
      pdf.addPage();
      y = margin;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(margin, y, contentWidth, 7, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(title, margin + 2, y + 5);
    y += 11;
  };

  const line = (label: string, value: string) => {
    ensureSpace(6);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    const lines = pdf.splitTextToSize(value || '—', contentWidth - 45);
    pdf.text(lines, margin + 45, y);
    y += 5.5 * lines.length;
  };

  // Cabeçalho
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
  pdf.text(ordem.numero, margin, y);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  pdf.text(`${STATUS_LABEL[ordem.status]} • Prioridade ${PRIORIDADE_LABEL[ordem.prioridade]}`, margin, y + 6);
  y += 14;

  sectionTitle('Informações gerais');
  line('Tipo', ordem.tipo);
  line('Origem', ordem.origem);
  line('Solicitante', ordem.solicitante);
  line('Setor', ordem.setor || '');
  line('Responsável', ordem.responsavel || '');
  line('Equipe', ordem.equipe || '');
  line('Técnico', ordem.tecnico || '');
  line('Data prevista', `${ordem.dataPrevista || '—'} ${ordem.horarioPrevisto || ''}`.trim());
  y += 3;

  sectionTitle('Localização');
  line('Endereço', `${ordem.endereco || '—'}${ordem.numeroEndereco ? `, ${ordem.numeroEndereco}` : ''}`);
  line('Bairro / Cidade', `${ordem.bairro || '—'} — ${ordem.municipio || '—'}/${ordem.uf || ''}`);
  if (ordem.latitude != null && ordem.longitude != null) {
    line('Coordenadas', `${ordem.latitude.toFixed(6)}, ${ordem.longitude.toFixed(6)}`);
  }
  y += 3;

  sectionTitle('Problema e execução');
  line('Problema informado', ordem.problemaInformado || '');
  line('Observações', ordem.observacoes || '');
  line('Início da execução', ordem.execucaoInicioEm ? new Date(ordem.execucaoInicioEm).toLocaleString('pt-BR') : '—');
  line('Fim da execução', ordem.execucaoFimEm ? new Date(ordem.execucaoFimEm).toLocaleString('pt-BR') : '—');
  y += 3;

  sectionTitle(`Checklist (${ordem.checklist.filter((c) => c.estado === 'concluido').length}/${ordem.checklist.length})`);
  ordem.checklist.forEach((c) => {
    ensureSpace(6);
    const marca = c.estado === 'concluido' ? '[x]' : c.estado === 'nao_aplica' ? '[-]' : '[ ]';
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(`${marca} ${c.label}`, margin, y);
    y += 5.5;
  });
  y += 3;

  sectionTitle(`Materiais utilizados (${ordem.materiais.length})`);
  if (ordem.materiais.length === 0) {
    ensureSpace(6);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text('Nenhum material registrado.', margin, y);
    y += 6;
  } else {
    ordem.materiais.forEach((m) => {
      ensureSpace(6);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(`• ${m.material} — ${m.quantidade} ${m.unidade}`, margin, y);
      y += 5.5;
    });
  }
  y += 3;

  sectionTitle(`Ocorrências registradas (${ordem.ocorrencias.length})`);
  if (ordem.ocorrencias.length === 0) {
    ensureSpace(6);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text('Nenhuma ocorrência registrada.', margin, y);
    y += 6;
  } else {
    ordem.ocorrencias.forEach((o) => {
      ensureSpace(10);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(`• ${o.tipo} (${o.categoria})`, margin, y);
      y += 5;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      const desc = pdf.splitTextToSize(o.descricao || '', contentWidth - 6);
      pdf.text(desc, margin + 4, y);
      y += 5 * desc.length;
    });
  }

  pdf.save(`${ordem.numero}.pdf`);
}
