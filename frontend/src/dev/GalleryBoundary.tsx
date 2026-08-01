import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Isola cada painel da galeria.
 *
 * Sem isto, um erro em UM passo desmonta a árvore inteira e a galeria some —
 * o que já aconteceu duas vezes aqui (contexto de copiloto faltando), e o
 * efeito colateral é pior que o defeito: as capturas seguintes saem em
 * branco e parecem dizer que todos os passos estão quebrados.
 *
 * Uma galeria existe para mostrar o que há de errado num componente. Se ela
 * própria morre junto, ela deixa de fazer a única coisa que promete.
 */
interface State {
  error: Error | null;
}

export class GalleryBoundary extends Component<{ children: ReactNode; label: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[galeria] ${this.props.label} quebrou:`, error, info.componentStack);
  }

  componentDidUpdate(prev: { children: ReactNode; label: string }): void {
    // Trocar de painel limpa o erro: senão, um passo quebrado deixaria a
    // galeria presa nele para sempre.
    if (prev.label !== this.props.label && this.state.error) this.setState({ error: null });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="feature-unavailable">
          <div className="feature-unavailable-title">
            {this.props.label} — este painel quebrou ao renderizar
          </div>
          {this.state.error.message}
          <p style={{ marginTop: 8, fontSize: 12 }}>
            O erro está isolado: os outros painéis continuam utilizáveis. Detalhe completo no
            console.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
