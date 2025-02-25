import React from 'react';
import { Box, Container, Typography, Grid, Paper, Button } from '@mui/material';
import MetaTags from '../common/MetaTags';
import { styled } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

const ProjectCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'translateY(-5px)'
  }
}));

const MetricBox = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.default,
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  textAlign: 'center'
}));

const Portfolio = () => {
  const projects = [
    {
      id: 'shiny-dog-paws',
      title: 'Shiny Dog Paws',
      subtitle: 'Mobile Pet Grooming Service',
      description: 'Launched a successful mobile grooming service with targeted digital marketing campaigns.',
      metrics: [
        { label: 'New Clients', value: '56' },
        { label: 'Revenue Generated', value: '$5,040' },
        { label: 'ROAS', value: '340%' }
      ],
      image: '/project-images/shiny-dog-paws.jpg'
    },
    // Add more projects here
  ];

  return (
    <Box sx={{ py: 8 }}>
        <MetaTags
        title="Case Studies"
        description="Discover how we've helped businesses achieve their digital goals with our expertise in web development, SEO, copywriting, and design."
      />
      <Container maxWidth="lg">
        <Typography variant="h1" align="center" gutterBottom>
          Our Portfolio
        </Typography>
        <Typography variant="h5" align="center" color="textSecondary" paragraph sx={{ mb: 8 }}>
          Discover how we've helped businesses achieve their digital goals
        </Typography>

        <Grid container spacing={4}>
          {projects.map((project) => (
            <Grid item xs={12} md={6} key={project.id}>
              <ProjectCard elevation={2}>
                <Typography variant="h4" gutterBottom color="primary">
                  {project.title}
                </Typography>
                <Typography variant="subtitle1" color="textSecondary" gutterBottom>
                  {project.subtitle}
                </Typography>
                <Typography variant="body1" paragraph>
                  {project.description}
                </Typography>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  {project.metrics.map((metric) => (
                    <Grid item xs={4} key={metric.label}>
                      <MetricBox>
                        <Typography variant="h4" color="primary">
                          {metric.value}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {metric.label}
                        </Typography>
                      </MetricBox>
                    </Grid>
                  ))}
                </Grid>

                <Box sx={{ mt: 'auto' }}>
                  <Button
                    component={RouterLink}
                    to={`/portfolio/${project.id}`}
                    variant="contained"
                    color="primary"
                    fullWidth
                  >
                    View Case Study
                  </Button>
                </Box>
              </ProjectCard>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Ready to Grow Your Business?
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            component={RouterLink}
            to="/contact"
            sx={{ mt: 2 }}
          >
            Schedule a Free Consultation
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default Portfolio;