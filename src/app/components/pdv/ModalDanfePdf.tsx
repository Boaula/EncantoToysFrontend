interface Props {
  url: string | null;
  onConfirmarEFechar: () => void;
}

export function ModalDanfePdf({ url, onConfirmarEFechar }: Props) {
  if (!url) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '12px', padding: '20px',
        width: '85%', maxWidth: '850px', height: '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0px 10px 30px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px', fontWeight: 'bold' }}>
            📄 DANFE NFC-e - Visualização / Impressão
          </h3>
          
          <button 
            onClick={onConfirmarEFechar} 
            style={{ 
              backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '6px',
              padding: '10px 20px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            📥 BAIXAR p/ IMPRIMIR
          </button>
        </div>

        <iframe
          src={url}
          style={{ width: '100%', height: '100%', border: '1px solid #ddd', borderRadius: '6px' }}
          title="DANFE NFC-e"
        />
      </div>
    </div>
  );
}