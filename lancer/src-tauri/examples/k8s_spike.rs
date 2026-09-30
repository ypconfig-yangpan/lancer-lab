//! Spike 2: connect kube context and list namespaces/pods.
use lancer_lib::application::AppServices;

#[tokio::main]
async fn main() {
    let services = AppServices::new();
    let contexts = match services.list_kube_contexts(None).await {
        Ok(v) => v,
        Err(err) => {
            eprintln!("list_kube_contexts failed: {:?}", err.to_dto());
            std::process::exit(1);
        }
    };
    println!("contexts={}", contexts.len());
    for c in &contexts {
        println!("- {} current={}", c.name, c.is_current);
    }

    let context = std::env::var("KUBE_CONTEXT").unwrap_or_else(|_| {
        contexts
            .iter()
            .find(|c| c.is_current)
            .map(|c| c.name.clone())
            .or_else(|| contexts.first().map(|c| c.name.clone()))
            .unwrap_or_default()
    });
    if context.is_empty() {
        eprintln!("No kube context available");
        std::process::exit(1);
    }

    println!("connecting context={context}");
    let identity = match services.connect_cluster(None, context, true).await {
        Ok(v) => v,
        Err(err) => {
            eprintln!("connect_cluster failed: {:?}", err.to_dto());
            std::process::exit(2);
        }
    };
    println!(
        "connected id={} server={} ca={} tls_insecure={} readonly={} ssar_ok={}",
        identity.id,
        identity.api_server,
        identity.ca_fingerprint,
        identity.tls_insecure,
        identity.readonly,
        identity.capabilities.ssar_ok
    );

    let namespaces = match services.list_namespaces(identity.id.0.clone()).await {
        Ok(v) => v,
        Err(err) => {
            eprintln!("list_namespaces failed: {:?}", err.to_dto());
            std::process::exit(3);
        }
    };
    println!("namespaces={}", namespaces.len());
    let ns = if namespaces.iter().any(|n| n == "lancer-fixtures") {
        "lancer-fixtures".to_string()
    } else {
        namespaces
            .first()
            .cloned()
            .unwrap_or_else(|| "default".into())
    };

    let pods = match services.list_pods(identity.id.0.clone(), ns.clone()).await {
        Ok(v) => v,
        Err(err) => {
            eprintln!("list_pods failed: {:?}", err.to_dto());
            std::process::exit(4);
        }
    };
    println!("namespace={ns} pods={}", pods.len());
    for p in pods.iter().take(20) {
        println!("  {} phase={} ready={}", p.name, p.phase, p.ready);
    }

    let deployments = match services
        .list_deployments(identity.id.0.clone(), ns.clone())
        .await
    {
        Ok(v) => v,
        Err(err) => {
            eprintln!("list_deployments failed: {:?}", err.to_dto());
            std::process::exit(5);
        }
    };
    println!("deployments={}", deployments.len());
    for d in deployments.iter().take(20) {
        println!("  {} ready={} image={}", d.name, d.ready, d.image);
    }

    let services_list = match services
        .list_services(identity.id.0.clone(), ns.clone())
        .await
    {
        Ok(v) => v,
        Err(err) => {
            eprintln!("list_services failed: {:?}", err.to_dto());
            std::process::exit(6);
        }
    };
    println!("services={}", services_list.len());
    for s in services_list.iter().take(20) {
        println!("  {} type={} ports={}", s.name, s.service_type, s.ports);
    }
    println!("SPIKE2_OK");
}
